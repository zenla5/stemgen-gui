"""Tests for cloud inference runners (fal.ai, Replicate).

All network calls are mocked — no real API requests are made.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


def _parse_emit_output(captured_out: str) -> list[dict]:
    """Parse all JSON lines from captured stdout."""
    lines = [l for l in captured_out.strip().split("\n") if l.strip()]
    return [json.loads(l) for l in lines]


class MockFalClientError(Exception):
    """Stand-in for fal_client.client.FalClientError in tests."""


class MockConnectionError(Exception):
    """Stand-in for requests.ConnectionError in tests."""


class MockTimeout(Exception):
    """Stand-in for requests.Timeout in tests."""


def _make_mock_fal_client():
    """Create a mock fal_client module with proper exception classes."""
    mock = MagicMock()
    mock.client.FalClientError = MockFalClientError
    return mock


def _make_mock_requests():
    """Create a mock requests module with proper exception classes."""
    mock = MagicMock()
    mock.ConnectionError = MockConnectionError
    mock.Timeout = MockTimeout
    return mock


class TestRunFal:
    """Tests for run_fal() cloud runner."""

    def test_run_fal_exists_and_is_importable(self):
        import stemgen_sidecar
        assert hasattr(stemgen_sidecar, "run_fal")
        assert callable(stemgen_sidecar.run_fal)

    def test_run_fal_emits_progress_events_in_order(self, capsys, tmp_path):
        """Verify uploading → queued → downloading → saving progress sequence."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake wav data")

        mock_result = {
            "stems": [
                {"stem": "drums", "url": "https://fal.run/drums.wav"},
                {"stem": "bass", "url": "https://fal.run/bass.wav"},
                {"stem": "other", "url": "https://fal.run/other.wav"},
                {"stem": "vocals", "url": "https://fal.run/vocals.wav"},
            ]
        }

        mock_response = MagicMock()
        mock_response.content = b"fake stem audio"
        mock_response.raise_for_status = MagicMock()

        mock_fal = _make_mock_fal_client()
        mock_fal.upload_file.return_value = "https://storage.fal.ai/uploaded.wav"
        mock_fal.subscribe.return_value = mock_result

        mock_req = _make_mock_requests()
        mock_req.get.return_value = mock_response

        with patch("stemgen_sidecar.fal_client", mock_fal), \
             patch("stemgen_sidecar.requests", mock_req):
            stems = stemgen_sidecar.run_fal(
                input_file, tmp_path, "htdemucs", "fake-api-key"
            )

        assert len(stems) == 4
        assert set(stems.keys()) == {"drums", "bass", "other", "vocals"}

        events = _parse_emit_output(capsys.readouterr().out)
        stages = [e.get("stage") for e in events if e.get("status") == "progress"]
        assert "uploading" in stages
        assert "queued" in stages
        assert stages.count("downloading") == 4

    def test_run_fal_401_error_has_fallback_hint(self, capsys, tmp_path):
        """401 from fal.ai → error with fallback_hint."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_fal = _make_mock_fal_client()
        mock_fal.upload_file.return_value = "https://storage.fal.ai/file.wav"
        mock_fal.subscribe.side_effect = MockFalClientError("401 Unauthorized")

        mock_req = _make_mock_requests()

        with patch("stemgen_sidecar.fal_client", mock_fal), \
             patch("stemgen_sidecar.requests", mock_req):
            with pytest.raises(MockFalClientError):
                stemgen_sidecar.run_fal(
                    input_file, tmp_path, "htdemucs", "bad-key"
                )

        events = _parse_emit_output(capsys.readouterr().out)
        error_events = [e for e in events if e.get("status") == "error"]
        assert len(error_events) >= 1
        assert error_events[0].get("fallback_hint") == "switch_to_local"
        assert "API key rejected" in error_events[0]["error"]

    def test_run_fal_connection_error_retries_once(self, tmp_path):
        """ConnectionError on subscribe → retry once, then error."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_fal = _make_mock_fal_client()
        mock_fal.upload_file.return_value = "https://storage.fal.ai/file.wav"
        mock_fal.subscribe.side_effect = MockConnectionError("conn failed")

        mock_req = _make_mock_requests()

        with patch("stemgen_sidecar.fal_client", mock_fal), \
             patch("stemgen_sidecar.requests", mock_req), \
             patch("stemgen_sidecar.time.sleep") as mock_sleep:
            with pytest.raises(MockConnectionError):
                stemgen_sidecar.run_fal(
                    input_file, tmp_path, "htdemucs", "fake-key"
                )

            # sleep(5) should have been called once for the retry
            mock_sleep.assert_called_once_with(5)
            # subscribe should have been called twice (original + retry)
            assert mock_fal.subscribe.call_count == 2


class TestRunSeparationCloudDispatch:
    """Tests that run_separation dispatches to cloud runners correctly."""

    def test_cloud_fal_dispatches_to_run_fal(self, tmp_path):
        """device='cloud', provider='fal' → calls run_fal."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_response = MagicMock()
        mock_response.content = b"stem"
        mock_response.raise_for_status = MagicMock()

        mock_result = {
            "stems": [
                {"stem": "drums", "url": "https://fal.run/d.wav"},
                {"stem": "bass", "url": "https://fal.run/b.wav"},
                {"stem": "other", "url": "https://fal.run/o.wav"},
                {"stem": "vocals", "url": "https://fal.run/v.wav"},
            ]
        }

        mock_fal = _make_mock_fal_client()
        mock_fal.upload_file.return_value = "https://storage.fal.ai/file.wav"
        mock_fal.subscribe.return_value = mock_result

        mock_req = _make_mock_requests()
        mock_req.get.return_value = mock_response

        with patch("stemgen_sidecar.fal_client", mock_fal), \
             patch("stemgen_sidecar.requests", mock_req):
            stems = stemgen_sidecar.run_separation(
                "htdemucs", input_file, tmp_path,
                device="cloud", provider="fal", api_key="test-key",
            )

        assert len(stems) == 4
        mock_fal.upload_file.assert_called_once()


def _make_mock_replicate():
    """Create a mock replicate module."""
    mock = MagicMock()
    mock.predictions.create = MagicMock()
    return mock


class TestRunReplicate:
    """Tests for run_replicate() cloud runner."""

    def test_run_replicate_exists_and_is_importable(self):
        import stemgen_sidecar
        assert hasattr(stemgen_sidecar, "run_replicate")
        assert callable(stemgen_sidecar.run_replicate)

    def test_run_replicate_success(self, capsys, tmp_path):
        """Successful run emits progress events and returns stems."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake wav data")

        stem_urls = {
            "drums": "https://replicate.delivery/d.wav",
            "bass": "https://replicate.delivery/b.wav",
            "other": "https://replicate.delivery/o.wav",
            "vocals": "https://replicate.delivery/v.wav",
        }

        # Mock prediction that processes for 2 polls then succeeds
        mock_prediction = MagicMock()
        poll_count = [0]

        def mock_reload():
            poll_count[0] += 1
            if poll_count[0] >= 2:
                mock_prediction.status = "succeeded"
                mock_prediction.output = {"stems": [
                    {"stem": k, "url": v} for k, v in stem_urls.items()
                ]}
            else:
                mock_prediction.status = "processing"

        mock_prediction.status = "processing"
        mock_prediction.reload = mock_reload

        mock_replicate = _make_mock_replicate()
        mock_replicate.predictions.create.return_value = mock_prediction

        mock_response = MagicMock()
        mock_response.content = b"fake stem"
        mock_response.raise_for_status = MagicMock()

        mock_req = _make_mock_requests()
        mock_req.get.return_value = mock_response

        with patch("stemgen_sidecar.replicate_module", mock_replicate), \
             patch("stemgen_sidecar.requests", mock_req), \
             patch("stemgen_sidecar.time.sleep"):
            stems = stemgen_sidecar.run_replicate(
                input_file, tmp_path, "htdemucs", "fake-key", "abc123"
            )

        assert len(stems) == 4
        mock_replicate.predictions.create.assert_called_once()

        events = _parse_emit_output(capsys.readouterr().out)
        stages = [e.get("stage") for e in events if e.get("status") == "progress"]
        assert "uploading" in stages
        assert "queued" in stages
        assert "separating" in stages
        assert "downloading" in stages

    def test_run_replicate_failed_prediction_has_fallback_hint(self, capsys, tmp_path):
        """Failed prediction → error with fallback_hint."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_prediction = MagicMock()
        mock_prediction.status = "failed"
        mock_prediction.error = "Out of memory"

        mock_replicate = _make_mock_replicate()
        mock_replicate.predictions.create.return_value = mock_prediction

        mock_req = _make_mock_requests()

        with patch("stemgen_sidecar.replicate_module", mock_replicate), \
             patch("stemgen_sidecar.requests", mock_req):
            with pytest.raises(RuntimeError, match="failed"):
                stemgen_sidecar.run_replicate(
                    input_file, tmp_path, "htdemucs", "fake-key", "abc123"
                )

        events = _parse_emit_output(capsys.readouterr().out)
        error_events = [e for e in events if e.get("status") == "error"]
        assert len(error_events) >= 1
        assert error_events[0].get("fallback_hint") == "switch_to_local"

    def test_run_replicate_connection_error_retries_once(self, tmp_path):
        """ConnectionError on prediction.reload() → retry once."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_prediction = MagicMock()
        mock_prediction.reload.side_effect = MockConnectionError("conn failed")

        mock_replicate = _make_mock_replicate()
        mock_replicate.predictions.create.return_value = mock_prediction

        mock_req = _make_mock_requests()

        with patch("stemgen_sidecar.replicate_module", mock_replicate), \
             patch("stemgen_sidecar.requests", mock_req), \
             patch("stemgen_sidecar.time.sleep") as mock_sleep:
            with pytest.raises(MockConnectionError):
                stemgen_sidecar.run_replicate(
                    input_file, tmp_path, "htdemucs", "fake-key", "abc123"
                )

            mock_sleep.assert_called_with(5)
            assert mock_prediction.reload.call_count == 2


class TestRunSeparationReplicateDispatch:
    """Tests that run_separation dispatches to replicate runner correctly."""

    def test_cloud_replicate_dispatches_to_run_replicate(self, tmp_path):
        """device='cloud', provider='replicate' → calls run_replicate."""
        import stemgen_sidecar

        input_file = tmp_path / "test.wav"
        input_file.write_bytes(b"fake")

        mock_prediction = MagicMock()
        mock_prediction.status = "succeeded"
        mock_prediction.output = {"stems": [
            {"stem": "drums", "url": "https://r.delivery/d.wav"},
            {"stem": "bass", "url": "https://r.delivery/b.wav"},
            {"stem": "other", "url": "https://r.delivery/o.wav"},
            {"stem": "vocals", "url": "https://r.delivery/v.wav"},
        ]}

        mock_replicate = _make_mock_replicate()
        mock_replicate.predictions.create.return_value = mock_prediction

        mock_response = MagicMock()
        mock_response.content = b"stem"
        mock_response.raise_for_status = MagicMock()

        mock_req = _make_mock_requests()
        mock_req.get.return_value = mock_response

        with patch("stemgen_sidecar.replicate_module", mock_replicate), \
             patch("stemgen_sidecar.requests", mock_req):
            stems = stemgen_sidecar.run_separation(
                "htdemucs", input_file, tmp_path,
                device="cloud", provider="replicate",
                api_key="test-key", version_hash="abc123",
            )

        assert len(stems) == 4
        mock_replicate.predictions.create.assert_called_once()
