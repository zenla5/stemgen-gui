"""Smoke tests for the stemgen sidecar CLI and core functions."""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest


class TestEmit:
    """Tests for the emit() helper."""

    def test_emit_writes_valid_json_to_stdout(self, capsys):
        import stemgen_sidecar

        stemgen_sidecar.emit({"status": "ok", "message": "hello"})
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed == {"status": "ok", "message": "hello"}

    def test_emit_flushes(self, capsys):
        import stemgen_sidecar

        stemgen_sidecar.emit({"status": "test"})
        # If we got here without hanging, flush worked
        captured = capsys.readouterr()
        assert captured.out.strip()


class TestCheckDependencies:
    """Tests for check_dependencies()."""

    def test_returns_boolean(self):
        import stemgen_sidecar

        result = stemgen_sidecar.check_dependencies()
        assert isinstance(result, bool)


class TestRunSeparationDispatch:
    """Tests for run_separation() model dispatch."""

    def test_unknown_model_exits(self):
        import stemgen_sidecar

        with pytest.raises(SystemExit):
            stemgen_sidecar.run_separation(
                "unknown_model", Path("/tmp/x.wav"), Path("/tmp"), "cpu"
            )


class TestInvalidModelExit:
    """Tests for sidecar exit behaviour with invalid model names."""

    def test_invalid_model_exits_non_zero(self, monkeypatch, tmp_path):
        """Running with a non-existent model name must exit with non-zero code."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "nonexistent_model_xyz",
             "--input", str(input_file), "--output", str(tmp_path),
             "--device", "cpu"],
        )
        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()
        assert exc_info.value.code != 0

    def test_invalid_model_emits_error_json(self, capsys, monkeypatch, tmp_path):
        """The final stdout line must be valid JSON with status=error and non-empty error field."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "nonexistent_model_xyz",
             "--input", str(input_file), "--output", str(tmp_path),
             "--device", "cpu"],
        )
        with pytest.raises(SystemExit):
            stemgen_sidecar.main()

        captured = capsys.readouterr()
        lines = [l.strip() for l in captured.out.strip().split('\n') if l.strip()]
        assert len(lines) > 0, "Expected at least one line of JSON output"
        parsed = json.loads(lines[-1])
        assert parsed.get("status") == "error"
        assert parsed.get("error"), "Error message should be non-empty"

    def test_invalid_model_leaves_no_partial_output(self, monkeypatch, tmp_path):
        """No partial stem output files should remain after a failed run."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        output_dir = tmp_path / "output"
        output_dir.mkdir()

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "nonexistent_model_xyz",
             "--input", str(input_file), "--output", str(output_dir),
             "--device", "cpu"],
        )
        with pytest.raises(SystemExit):
            stemgen_sidecar.main()

        # Output directory should be empty (no partial wav/mp3 files)
        remaining = list(output_dir.iterdir())
        assert len(remaining) == 0, f"Expected empty output dir, found: {remaining}"


class TestCloudCliValidation:
    """Tests for --device cloud validation in main()."""

    def test_cloud_without_provider_exits_with_error(self, capsys, monkeypatch, tmp_path):
        """--device cloud without --provider must exit non-zero with 'No API key set'."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "htdemucs", "--input", str(input_file),
             "--output", str(tmp_path), "--device", "cloud"],
        )
        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()
        assert exc_info.value.code == 1
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert "No API key set" in parsed["error"]

    def test_cloud_provider_without_api_key_exits_with_error(self, capsys, monkeypatch, tmp_path):
        """--device cloud --provider fal without --api-key must exit non-zero."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "htdemucs", "--input", str(input_file),
             "--output", str(tmp_path), "--device", "cloud", "--provider", "fal"],
        )
        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()
        assert exc_info.value.code == 1
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert "No API key set" in parsed["error"]

    def test_cloud_replicate_without_version_exits_with_error(self, capsys, monkeypatch, tmp_path):
        """--device cloud --provider replicate --api-key X without --provider-version exits non-zero."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        monkeypatch.setattr(
            sys, "argv",
            ["stemgen_sidecar", "--model", "htdemucs", "--input", str(input_file),
             "--output", str(tmp_path), "--device", "cloud", "--provider", "replicate",
             "--api-key", "fake-key"],
        )
        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()
        assert exc_info.value.code == 1
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert "No Replicate version" in parsed["error"]


# ----------------------------------------------------------------------------------------------
# Tests for _run_demucs_model audio-loading path (guards against bugs A–E, F)
# ----------------------------------------------------------------------------------------------


class TestRunDemucsModel:
    """Tests for the demucs audio-loading and stem-saving logic.

    The demucs imports (AudioFile, apply_model, get_model, torchaudio) are
    function-local inside _run_demucs_model, so we mock them via sys.modules
    before calling the function.
    """

    @staticmethod
    def _make_mocks(torch):
        """Build fake demucs modules and a fake model for patching."""
        from unittest.mock import MagicMock
        import types

        fake_model = MagicMock()
        fake_model.samplerate = 44100
        fake_model.audio_channels = 2
        fake_model.sources = ["drums", "bass", "other", "vocals"]

        fake_wav = torch.zeros(2, 44100)
        num_sources = len(fake_model.sources)

        # demucs.audio.AudioFile(path).read(...) -> fake_wav
        mock_audio_instance = MagicMock()
        mock_audio_instance.read.return_value = fake_wav
        mock_audio_file_cls = MagicMock(return_value=mock_audio_instance)

        # demucs.apply.apply_model(model, wav, ...) -> list of source tensors
        mock_apply = MagicMock(return_value=[torch.zeros(num_sources, 2, 44100)])

        # demucs.pretrained.get_model(name, device=...) -> fake_model
        mock_get_model = MagicMock(return_value=fake_model)

        # torchaudio.save — just a no-op
        mock_ta_save = MagicMock()

        # Build fake demucs module tree
        demucs_audio_mod = types.ModuleType("demucs.audio")
        demucs_audio_mod.AudioFile = mock_audio_file_cls

        demucs_apply_mod = types.ModuleType("demucs.apply")
        demucs_apply_mod.apply_model = mock_apply

        demucs_pretrained_mod = types.ModuleType("demucs.pretrained")
        demucs_pretrained_mod.get_model = mock_get_model

        demucs_mod = types.ModuleType("demucs")
        demucs_mod.audio = demucs_audio_mod
        demucs_mod.apply = demucs_apply_mod
        demucs_mod.pretrained = demucs_pretrained_mod

        fake_torchaudio = MagicMock()
        fake_torchaudio.save = mock_ta_save

        modules_patch = {
            "demucs": demucs_mod,
            "demucs.audio": demucs_audio_mod,
            "demucs.apply": demucs_apply_mod,
            "demucs.pretrained": demucs_pretrained_mod,
            "torchaudio": fake_torchaudio,
        }

        return modules_patch, fake_model, mock_apply

    def test_audio_file_read_returns_tensor(self, tmp_path):
        """After the loading block, wav must still be a torch.Tensor (guards Bug D)."""
        torch = pytest.importorskip("torch")
        from unittest.mock import patch
        import stemgen_sidecar

        modules_patch, fake_model, mock_apply = self._make_mocks(torch)

        with patch.dict(sys.modules, modules_patch):
            input_path = tmp_path / "test.wav"
            input_path.write_bytes(b"fake")
            output_dir = tmp_path / "out"
            output_dir.mkdir()

            stems = stemgen_sidecar._run_demucs_model(
                input_path, output_dir, device="cpu", model_name="htdemucs"
            )
            assert isinstance(stems, dict)
            assert len(stems) == len(fake_model.sources)

    def test_mix_shape_is_batch_channels_samples(self, tmp_path):
        """The tensor passed to apply_model must have ndim==3 and shape[1]==channels (guards Bugs B, C, E)."""
        torch = pytest.importorskip("torch")
        from unittest.mock import patch
        import stemgen_sidecar

        modules_patch, fake_model, mock_apply = self._make_mocks(torch)

        with patch.dict(sys.modules, modules_patch):
            input_path = tmp_path / "test.wav"
            input_path.write_bytes(b"fake")
            output_dir = tmp_path / "out"
            output_dir.mkdir()

            stemgen_sidecar._run_demucs_model(
                input_path, output_dir, device="cpu", model_name="htdemucs"
            )

            # apply_model was called — inspect the audio tensor argument
            assert mock_apply.called
            audio_arg = mock_apply.call_args[0][1]  # second positional arg
            assert audio_arg.ndim == 3, f"Expected 3-D (batch, channels, samples), got {audio_arg.ndim}-D shape {audio_arg.shape}"
            assert audio_arg.shape[1] == 2, f"Expected 2 channels at dim 1, got {audio_arg.shape[1]}"

    def test_stem_names_match_model_sources(self, tmp_path):
        """The returned stems dict keys must match model.sources exactly (guards Bug F)."""
        torch = pytest.importorskip("torch")
        from unittest.mock import patch, MagicMock
        import stemgen_sidecar

        custom_sources = ["vocals", "drums", "bass"]
        modules_patch, _, _ = self._make_mocks(torch)

        # Override model sources
        fake_model = MagicMock()
        fake_model.samplerate = 44100
        fake_model.audio_channels = 2
        fake_model.sources = custom_sources

        modules_patch["demucs.pretrained"].get_model = MagicMock(return_value=fake_model)
        modules_patch["demucs.apply"].apply_model = MagicMock(
            return_value=[torch.zeros(len(custom_sources), 2, 44100)]
        )

        with patch.dict(sys.modules, modules_patch):
            input_path = tmp_path / "test.wav"
            input_path.write_bytes(b"fake")
            output_dir = tmp_path / "out"
            output_dir.mkdir()

            stems = stemgen_sidecar._run_demucs_model(
                input_path, output_dir, device="cpu", model_name="htdemucs"
            )

            assert set(stems.keys()) == set(custom_sources)

    @pytest.mark.integration
    def test_sidecar_cli_cpu_exit_zero(self, tmp_path):
        """Full integration: run sidecar CLI with demucs on CPU, expect 4 output WAVs."""
        import subprocess

        fixture = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "audio" / "test-short.wav"
        if not fixture.exists():
            pytest.skip(f"Fixture not found: {fixture}")

        output_dir = tmp_path / "stems"
        result = subprocess.run(
            [sys.executable, "stemgen_sidecar.py",
             "--model", "demucs",
             "--input", str(fixture),
             "--output", str(output_dir),
             "--device", "cpu"],
            capture_output=True, text=True, timeout=300,
        )
        assert result.returncode == 0, f"Exit code {result.returncode}\nstderr:\n{result.stderr}"
        wav_files = list(output_dir.glob("*.wav"))
        assert len(wav_files) == 4, f"Expected 4 WAV files, found {len(wav_files)}: {wav_files}"
