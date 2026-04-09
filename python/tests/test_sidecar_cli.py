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
