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
        fake_model.to.return_value = fake_model

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
        fake_model.to.return_value = fake_model

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
        pytest.importorskip("torch", reason="demucs/torch not installed")
        pytest.importorskip("demucs", reason="demucs not installed")
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





# ----------------------------------------------------------------------------------------------
# Tests for --check-model and --list-models CLI modes (TASK-03)
# ----------------------------------------------------------------------------------------------


class TestCheckModel:
    """Tests for --check-model and --list-models CLI modes."""

    def test_check_model_available(self, monkeypatch, capsys):
        """--check-model with a cached model must return available=true."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr("demucs.pretrained._IS_TEST", False, raising=False)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--check-model", "htdemucs"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["available"] is True
        assert parsed["model_id"] == "htdemucs"
        assert parsed["pretrained_name"] == "htdemucs"

    def test_check_model_not_available(self, monkeypatch, capsys):
        """--check-model with an uncached model must return available=false."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        def raise_error(*args, **kwargs):
            raise FileNotFoundError("Model not found in cache")

        mock_get_model = MagicMock(side_effect=raise_error)
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr("demucs.pretrained._IS_TEST", False, raising=False)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--check-model", "htdemucs_ft"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["available"] is False
        assert parsed["model_id"] == "htdemucs_ft"

    def test_list_models_json_array(self, monkeypatch, capsys):
        """--list-models must output a JSON array with all known model IDs."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr("demucs.pretrained._IS_TEST", False, raising=False)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--list-models"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert isinstance(parsed, list)
        ids = {item["id"] for item in parsed}
        assert "demucs" in ids
        assert "htdemucs" in ids
        assert "htdemucs_ft" in ids
        for item in parsed:
            assert "id" in item
            assert "available" in item

    def test_list_models_returns_all_models_with_available_false_when_none_downloaded(self, monkeypatch, capsys):
        """--list-models returns all models with available=false when none are downloaded."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        # Mock get_model to always raise FileNotFoundError (no models cached)
        def raise_not_found(*args, **kwargs):
            raise FileNotFoundError("Model not found in cache")

        mock_get_model = MagicMock(side_effect=raise_not_found)
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr("demucs.pretrained._IS_TEST", False, raising=False)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--list-models"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert isinstance(parsed, list)
        # All models should be returned with available=False
        for item in parsed:
            assert item["available"] is False

    def test_check_model_unknown_model_returns_available_false(self, monkeypatch, capsys):
        """--check-model with unknown model ID returns { available: false } without exception."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        def raise_not_found(*args, **kwargs):
            raise FileNotFoundError("Unknown model")

        mock_get_model = MagicMock(side_effect=raise_not_found)
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr("demucs.pretrained._IS_TEST", False, raising=False)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--check-model", "unknown_model_xyz"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        parsed = json.loads(captured.out.strip())
        assert parsed["available"] is False
        assert parsed["model_id"] == "unknown_model_xyz"

    def test_download_model_invalid_id_exits_nonzero(self, monkeypatch, capsys):
        """--download-model with invalid model ID exits non-zero with error message to stderr."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        def raise_not_found(*args, **kwargs):
            raise FileNotFoundError("Model not found")

        mock_get_model = MagicMock(side_effect=raise_not_found)
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--download-model", "invalid_model_xyz"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code != 0
        captured = capsys.readouterr()
        # Error is printed to stderr, not JSON
        assert "Download failed" in captured.err or "not found" in captured.err.lower()


# ----------------------------------------------------------------------------------------------
# Tests for DEMUCS_PRETRAINED_NAME mapping (TASK-02)
# ----------------------------------------------------------------------------------------------


class TestDownloadModel:
    """Tests for --download-model with model name mapping."""

    def test_download_demucs_resolves_to_htdemucs(self, monkeypatch, capsys):
        """--download-model demucs must resolve to htdemucs before calling get_model."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--download-model", "demucs"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        mock_get_model.assert_called_once_with("htdemucs")

    def test_download_htdemucs_ft_resolves_correctly(self, monkeypatch, capsys):
        """--download-model htdemucs_ft must resolve to htdemucs_ft."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--download-model", "htdemucs_ft"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        mock_get_model.assert_called_once_with("htdemucs_ft")

    def test_download_unknown_id_passes_through(self, monkeypatch, capsys):
        """--download-model with an unknown ID must pass through unchanged."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--download-model", "my_custom_model"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        mock_get_model.assert_called_once_with("my_custom_model")


# ----------------------------------------------------------------------------------------------
# Tests for get_model() device-keyword bug fix (TASK-01)
# ----------------------------------------------------------------------------------------------


class TestDemucsModelLoad:
    """Tests for the get_model() call in _run_demucs_model."""

    def test_get_model_called_without_device_kwarg(self, tmp_path):
        """get_model must be called with only one positional argument (model_name), no device kwarg."""
        torch = pytest.importorskip("torch")
        import stemgen_sidecar

        from unittest.mock import MagicMock
        import types

        fake_model = MagicMock()
        fake_model.samplerate = 44100
        fake_model.audio_channels = 2
        fake_model.sources = ["drums", "bass", "other", "vocals"]
        fake_model.to.return_value = fake_model

        fake_wav = torch.zeros(2, 44100)
        num_sources = len(fake_model.sources)

        mock_audio_instance = MagicMock()
        mock_audio_instance.read.return_value = fake_wav
        mock_audio_file_cls = MagicMock(return_value=mock_audio_instance)

        mock_apply = MagicMock(return_value=[torch.zeros(num_sources, 2, 44100)])

        mock_get_model = MagicMock(return_value=fake_model)

        mock_ta_save = MagicMock()

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

        with patch.dict(sys.modules, modules_patch):
            input_path = tmp_path / "test.wav"
            input_path.write_bytes(b"fake")
            output_dir = tmp_path / "out"
            output_dir.mkdir()

            stemgen_sidecar._run_demucs_model(
                input_path, output_dir, device="cpu", model_name="htdemucs"
            )

            # get_model must be called with exactly one positional arg (model_name)
            mock_get_model.assert_called_once()
            call_args = mock_get_model.call_args
            assert call_args.args == ("htdemucs",), (
                f"Expected get_model('htdemucs'), got args={call_args.args}"
            )
            assert call_args.kwargs == {}, (
                f"Expected no keyword args, got kwargs={call_args.kwargs}"
            )


# ----------------------------------------------------------------------------------------------
# Tests for check_dependencies() (TASK-012)
# ----------------------------------------------------------------------------------------------


class TestCheckDependenciesDetailed:
    """Tests for check_dependencies() with package presence/absence."""

    def test_returns_true_when_all_packages_present(self):
        """When torch, torchaudio, and demucs are installed, check_dependencies returns True."""
        import stemgen_sidecar

        # Only run if the packages are actually available
        try:
            import torch  # noqa: F401
            import torchaudio  # noqa: F401
            from demucs.pretrained import get_model  # noqa: F401
        except ImportError:
            pytest.skip("Required packages not installed")

        result = stemgen_sidecar.check_dependencies()
        assert result is True

    def test_returns_false_when_torch_missing(self, capsys):
        """When torch is missing, check_dependencies returns False and emits error JSON."""
        import stemgen_sidecar

        with patch.dict(sys.modules, {"torch": None}):
            result = stemgen_sidecar.check_dependencies()

        assert result is False
        captured = capsys.readouterr()
        lines = [l.strip() for l in captured.out.strip().split("\n") if l.strip()]
        assert len(lines) > 0, "Expected JSON output"
        parsed = json.loads(lines[-1])
        assert parsed["status"] == "error"
        assert "torch" in parsed["error"].lower()

    def test_returns_false_when_demucs_missing(self, capsys):
        """When demucs is missing, check_dependencies returns False and emits error JSON."""
        import stemgen_sidecar

        # Remove demucs from sys.modules to simulate it being missing
        demucs_modules = {k: None for k in sys.modules if k.startswith("demucs")}
        with patch.dict(sys.modules, demucs_modules, clear=False):
            # Also ensure demucs.pretrained is None
            with patch.dict(sys.modules, {"demucs": None, "demucs.pretrained": None}):
                result = stemgen_sidecar.check_dependencies()

        assert result is False
        captured = capsys.readouterr()
        lines = [l.strip() for l in captured.out.strip().split("\n") if l.strip()]
        assert len(lines) > 0
        parsed = json.loads(lines[-1])
        assert parsed["status"] == "error"
        assert parsed.get("error"), "Error message should be non-empty"

    def test_error_json_contains_install_hint(self, capsys):
        """The error JSON should include a pip install hint."""
        import stemgen_sidecar

        with patch.dict(sys.modules, {"torch": None}):
            stemgen_sidecar.check_dependencies()

        captured = capsys.readouterr()
        lines = [l.strip() for l in captured.out.strip().split("\n") if l.strip()]
        parsed = json.loads(lines[-1])
        assert "pip install" in parsed["error"]


# ----------------------------------------------------------------------------------------------
# Regression test for non-ASCII source file paths (TASK-021)
# ----------------------------------------------------------------------------------------------


# ----------------------------------------------------------------------------------------------
# Integration tests for --check-model and --list-models (TASK-08)
# ----------------------------------------------------------------------------------------------


class TestCheckModelIntegration:
    """Integration tests for --check-model and --list-models CLI modes.

    These tests require demucs/torch to be installed and are marked as
    'integration' so CI can skip them with -m "not integration".
    Run manually with: pytest tests/ -m integration --tb=short -v
    """

    @pytest.mark.integration
    def test_check_model_htdemucs_outputs_available_key(self, tmp_path):
        """--check-model htdemucs must output JSON with 'available' key."""
        pytest.importorskip("torch", reason="demucs/torch not installed")
        pytest.importorskip("demucs", reason="demucs not installed")
        import subprocess

        result = subprocess.run(
            [sys.executable, "stemgen_sidecar.py", "--check-model", "htdemucs"],
            capture_output=True, text=True, timeout=60,
        )
        assert result.returncode == 0, f"Exit code {result.returncode}\nstderr:\n{result.stderr}"
        parsed = json.loads(result.stdout.strip())
        assert "available" in parsed, f"Missing 'available' key in output: {parsed}"
        assert isinstance(parsed["available"], bool), f"'available' should be bool, got {type(parsed['available'])}"

    @pytest.mark.integration
    def test_list_models_outputs_all_four_ids(self, tmp_path):
        """--list-models must output a JSON array containing all four model IDs."""
        pytest.importorskip("torch", reason="demucs/torch not installed")
        pytest.importorskip("demucs", reason="demucs not installed")
        import subprocess

        result = subprocess.run(
            [sys.executable, "stemgen_sidecar.py", "--list-models"],
            capture_output=True, text=True, timeout=60,
        )
        assert result.returncode == 0, f"Exit code {result.returncode}\nstderr:\n{result.stderr}"
        parsed = json.loads(result.stdout.strip())
        assert isinstance(parsed, list), f"Expected list, got {type(parsed)}"
        ids = {item["id"] for item in parsed}
        assert "demucs" in ids, f"Missing 'demucs' in {ids}"
        assert "htdemucs" in ids, f"Missing 'htdemucs' in {ids}"
        assert "htdemucs_ft" in ids, f"Missing 'htdemucs_ft' in {ids}"
        assert "bs_roformer" in ids, f"Missing 'bs_roformer' in {ids}"

    @pytest.mark.integration
    def test_download_model_demucs_exits_zero(self, tmp_path):
        """--download-model demucs must exit 0 with 'Download complete' message."""
        pytest.importorskip("torch", reason="demucs/torch not installed")
        pytest.importorskip("demucs", reason="demucs not installed")
        import subprocess

        result = subprocess.run(
            [sys.executable, "stemgen_sidecar.py", "--download-model", "demucs"],
            capture_output=True, text=True, timeout=600,
        )
        assert result.returncode == 0, f"Exit code {result.returncode}\nstderr:\n{result.stderr}"
        assert "Download complete" in result.stdout, f"Missing 'Download complete' in stdout:\n{result.stdout}"


class TestDownloadModelMapping:
    """Non-integration unit tests for download-model model name mapping."""

    def test_download_model_demucs_does_not_call_get_model_with_demucs(self, monkeypatch, capsys):
        """--download-model demucs must never call get_model with bare string 'demucs'."""
        pytest.importorskip("demucs", reason="demucs not installed")
        import stemgen_sidecar
        from unittest.mock import MagicMock

        mock_get_model = MagicMock()
        monkeypatch.setattr("demucs.pretrained.get_model", mock_get_model)
        monkeypatch.setattr(sys, "argv", ["stemgen_sidecar", "--download-model", "demucs"])

        with pytest.raises(SystemExit) as exc_info:
            stemgen_sidecar.main()

        assert exc_info.value.code == 0
        # Verify get_model was called exactly once
        mock_get_model.assert_called_once()
        # Verify it was NOT called with bare "demucs"
        call_args = mock_get_model.call_args[0]
        assert call_args[0] != "demucs", (
            f"get_model should not be called with bare 'demucs', got {call_args}"
        )
        # Verify it was called with "htdemucs" (the mapped name)
        assert call_args[0] == "htdemucs", (
            f"get_model should be called with 'htdemucs', got {call_args[0]}"
        )


class TestNonAsciiPaths:
    """Tests for handling accented/CJK characters in file paths."""

    @pytest.mark.integration
    def test_sidecar_handles_accented_path(self, tmp_path):
        """Sidecar must handle input files in directories with accented characters."""
        pytest.importorskip("torch", reason="demucs/torch not installed")
        pytest.importorskip("demucs", reason="demucs not installed")
        import subprocess
        import shutil

        fixture = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "audio" / "test-accented-eau.wav"
        if not fixture.exists():
            pytest.skip(f"Fixture not found: {fixture}")

        # Create an accented directory path
        accented_dir = tmp_path / "été"
        accented_dir.mkdir()
        input_file = accented_dir / "test-accented-eau.wav"
        shutil.copy2(fixture, input_file)

        output_dir = tmp_path / "stems"
        result = subprocess.run(
            [sys.executable, "stemgen_sidecar.py",
             "--model", "demucs",
             "--input", str(input_file),
             "--output", str(output_dir),
             "--device", "cpu"],
            capture_output=True, text=True, timeout=300,
            env={**__import__("os").environ, "PYTHONUTF8": "1"},
        )
        assert result.returncode == 0, (
            f"Exit code {result.returncode}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
        wav_files = list(output_dir.glob("*.wav"))
        assert len(wav_files) == 4, f"Expected 4 WAV files, found {len(wav_files)}: {wav_files}"
