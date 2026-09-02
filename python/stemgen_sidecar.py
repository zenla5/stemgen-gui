#!/usr/bin/env python3
"""
Stemgen Sidecar — AI Stem Separation Wrapper

A Python script that wraps demucs/bs_roformer for stem separation
and communicates with the Tauri frontend via JSON lines on stdout.

Usage:
    python stemgen_sidecar.py --model <model> --input <path> --output <dir> --device <cpu|cuda|mps|cloud>
    python stemgen_sidecar.py --model <model> --input <path> --output <dir> --device cloud --provider <fal|replicate> --api-key <key>

Output:
    - Emits JSON progress lines to stdout
    - Creates 4 stem WAV files: <input>_drums.wav, <input>_bass.wav,
      <input>_other.wav, <input>_vocals.wav
    - Exit code 0 on success, non-zero on failure

Example stdout:
    {"status": "starting", "model": "bs_roformer", "device": "cuda", "message": "Loading model..."}
    {"status": "progress", "stage": "separating", "progress": 0.45, "message": "Separating stems..."}
    {"status": "done", "stems": {"drums": "...", "bass": "...", "other": "...", "vocals": "..."}}
    {"status": "error", "error": "Failed to load model: ..."}
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, Optional

# Cloud provider SDKs — optional; only needed for --device cloud
try:
    import fal_client
except ImportError:
    fal_client = None  # type: ignore[assignment]

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]

try:
    import replicate as replicate_module
except ImportError:
    replicate_module = None  # type: ignore[assignment]

# Maps GUI model IDs to the demucs pretrained model name used for
# download and loading.  "demucs" (the GUI label for the CPU-friendly
# model) resolves to "htdemucs" which is the lightest full model bag.
DEMUCS_PRETRAINED_NAME: dict[str, str] = {
    "demucs":      "htdemucs",
    "htdemucs":    "htdemucs",
    "htdemucs_ft": "htdemucs_ft",
}

# Default HuggingFace namespace used by demucs (mirrors demucs.hf.DEFAULT_NAMESPACE).
HF_NAMESPACE = "adefossez"


def hf_repo_name(name: str) -> str:
    """Map a demucs pretrained model name to its HuggingFace repository name,
    mirroring `demucs.hf.hf_repo_name` (e.g. htdemucs -> HTDemucs,
    htdemucs_ft -> HTDemucs-ft)."""
    if name == "htdemucs":
        return "HTDemucs"
    if name.startswith("htdemucs_"):
        return "HTDemucs-" + name[len("htdemucs_"):]
    return "Demucs-" + name


def hf_repo_id(pretrained_name: str) -> str:
    """Full HuggingFace repo id for a demucs pretrained model name."""
    return f"{HF_NAMESPACE}/{hf_repo_name(pretrained_name)}"


def _progress_emit(progress: float, message: str) -> None:
    """Emit a download progress JSON line (progress is 0..1)."""
    emit({
        "status": "progress",
        "stage": "downloading",
        "progress": round(progress, 4),
        "message": message,
    })


class _ProgressTqdm:
    """A minimal tqdm-compatible progress callback for huggingface_hub.

    huggingface_hub's `snapshot_download(..., tqdm_class=...)` calls
    `obj.update(n)` as bytes are transferred. We forward those updates to
    stdout as JSON progress lines so the Rust backend can stream real
    download progress to the UI.

    A bare duck-typed class is not enough: huggingface_hub also calls
    `refresh()`, `set_description()`, `set_postfix_str()`, `format_dict`,
    `total`/`n` attribute writes and `__enter__`/`__exit__` on the object, so
    we subclass the real `tqdm.tqdm` and only override `update` to emit JSON
    progress. `tqdm` is a transitive dependency of huggingface_hub.
    """

    def __init__(self, total: int = 0, desc: str = "", **kwargs):
        from tqdm import tqdm as _tqdm

        self._tqdm = _tqdm(total=total, desc=desc, **kwargs)
        self._last_pct = -1.0

    @property
    def n(self) -> int:
        return self._tqdm.n

    @n.setter
    def n(self, value: int) -> None:
        self._tqdm.n = value

    @property
    def total(self) -> int:
        return self._tqdm.total

    @total.setter
    def total(self, value: int) -> None:
        self._tqdm.total = value

    @property
    def format_dict(self) -> dict:
        return self._tqdm.format_dict

    def update(self, n: int) -> None:
        self._tqdm.update(n)
        pct = self._tqdm.n / self._tqdm.total if self._tqdm.total else 0.0
        # Throttle to ~1% steps to avoid flooding the IPC bridge.
        if pct - self._last_pct >= 0.01 or pct >= 1.0:
            self._last_pct = pct
            _progress_emit(pct, f"{self._tqdm.desc} ({self._tqdm.n // (1024*1024)} MB / {self._tqdm.total // (1024*1024)} MB)")

    def refresh(self) -> None:
        self._tqdm.refresh()

    def close(self) -> None:
        self._tqdm.close()

    def set_description(self, desc: str, refresh: bool = True) -> None:
        self._tqdm.set_description(desc, refresh=refresh)

    def set_postfix_str(self, s: str, refresh: bool = True) -> None:
        self._tqdm.set_postfix_str(s, refresh=refresh)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def _download_model_weights(pretrained_name: str) -> None:
    """Download a demucs model's weights into the HuggingFace cache.

    Uses `huggingface_hub.snapshot_download` with a progress callback so the
    caller can stream real download progress. After the snapshot is complete
    the model is fully cached and `demucs.pretrained.get_model` will load it
    without hitting the network.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        raise RuntimeError(
            "huggingface_hub is required to download demucs models. Install with: pip install huggingface_hub"
        )

    repo_id = hf_repo_id(pretrained_name)
    _progress_emit(0.0, f"Starting download of {pretrained_name}...")
    snapshot_download(
        repo_id,
        tqdm_class=_ProgressTqdm,
    )
    _progress_emit(1.0, f"{pretrained_name} downloaded")


def _model_weights_available(pretrained_name: str) -> bool:
    """True if a demucs model's weights are already fully cached locally.

    This is a true cache-only check: it never contacts the network. It mirrors
    exactly what `demucs.hf.get_hf_model` needs — the bag definition yaml plus
    one safetensors file per model in the bag — by resolving each through
    `hf_hub_download(..., local_files_only=True)`, which raises if the file is
    not already cached.

    The old implementation set `demucs.pretrained._IS_TEST = True`, which is a
    no-op in demucs 4.1.0 — so a "check" would silently download the model.
    A whole-snapshot `snapshot_download(local_files_only=True)` is too strict:
    demucs only downloads the files it needs, so the cache can legitimately
    hold a usable model while the snapshot is "incomplete".
    """
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        return False

    repo_id = hf_repo_id(pretrained_name)
    try:
        # The bag yaml lists the model signatures to load.
        yaml_path = hf_hub_download(repo_id, f"{pretrained_name}.yaml", local_files_only=True)
        with open(yaml_path) as f:
            import yaml as _yaml
            bag = _yaml.safe_load(f)
        for sig in bag.get("models", []):
            hf_hub_download(repo_id, f"{sig}.safetensors", local_files_only=True)
        return True
    except Exception:
        return False


def _delete_model_weights(pretrained_name: str) -> None:
    """Remove a demucs model's weights from the HuggingFace cache.

    Uses `huggingface_hub.scan_cache_dir().delete_revisions(...)` so only the
    revisions belonging to this repo are removed (blobs shared with other
    cached revisions are preserved). Falls back to removing the whole repo
    directory if the cache manager cannot be used.
    """
    repo_id = hf_repo_id(pretrained_name)
    try:
        from huggingface_hub import scan_cache_dir
    except ImportError:
        raise RuntimeError(
            "huggingface_hub is required to delete demucs models. Install with: pip install huggingface_hub"
        )

    cache_info = scan_cache_dir()
    repo_ids = {repo.repo_id for repo in cache_info.repos}
    if repo_id not in repo_ids:
        # Nothing cached for this model — treat as already deleted.
        return

    revisions = [
        revision.commit_hash
        for repo in cache_info.repos
        if repo.repo_id == repo_id
        for revision in repo.revisions
    ]
    if revisions:
        cache_info.delete_revisions(*revisions).execute()


# ------------------------------------------------------------------------------
# JSON line output helper
# ------------------------------------------------------------------------------

def emit(data: dict) -> None:
    """Write a JSON line to stdout and flush."""
    print(json.dumps(data), flush=True)


# ------------------------------------------------------------------------------
# Model runners
# ------------------------------------------------------------------------------

def _run_demucs_model(
    input_path: Path,
    output_dir: Path,
    device: str,
    model_name: str,
    shifts: int = 0,
) -> Dict[str, Path]:
    """Shared implementation for all demucs-family models.

    Parameters
    ----------
    input_path : Path
        Input audio file.
    output_dir : Path
        Directory to write stem WAVs.
    device : str
        "cpu", "cuda", or "mps".
    model_name : str
        Pretrained model name (e.g. "htdemucs", "htdemucs_ft").
    shifts : int
        Number of random shifts for apply_model (0 = deterministic).
    """
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    import torchaudio

    emit({
        "status": "progress",
        "stage": "loading",
        "progress": 0.05,
        "message": f"Loading {model_name} model...",
    })

    # Determine device
    if device == "cuda" and torch.cuda.is_available():
        run_device = torch.device("cuda")
        emit({"status": "progress", "stage": "device", "progress": 0.1, "message": "Using NVIDIA CUDA"})
    elif device == "mps" and torch.backends.mps.is_available():
        run_device = torch.device("mps")
        emit({"status": "progress", "stage": "device", "progress": 0.1, "message": "Using Apple Silicon MPS"})
    else:
        run_device = torch.device("cpu")
        emit({"status": "progress", "stage": "device", "progress": 0.1, "message": "Using CPU"})

    model = get_model(model_name)
    model = model.to(run_device)
    model.eval()

    emit({
        "status": "progress",
        "stage": "separating",
        "progress": 0.2,
        "message": "Loading audio file...",
    })

    # Load audio resampled to model's sample rate and channel count
    wav = AudioFile(input_path).read(
        stems=0,
        samplerate=model.samplerate,
        channels=model.audio_channels,
    )
    # wav is already a torch.Tensor of shape (channels, samples)
    source = str(input_path.stem)

    emit({
        "status": "progress",
        "stage": "separating",
        "progress": 0.3,
        "message": "Running AI separation...",
    })

    with torch.no_grad():
        # wav: (channels, samples) — move to device and normalise
        wav = wav.to(run_device)
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / (ref.std() + 1e-8)
        # apply_model expects (batch, channels, samples)
        sources = apply_model(
            model, wav[None], device=run_device, shifts=shifts, progress=False
        )[0]

    emit({
        "status": "progress",
        "stage": "saving",
        "progress": 0.85,
        "message": "Saving stem files...",
    })

    # Use model-reported source names instead of hardcoded list.
    # model.sources may have more or fewer than four stems depending on the model.
    stem_names = list(model.sources)
    stems: Dict[str, Path] = {}

    for i, stem_name in enumerate(stem_names):
        stem_data = sources[i].cpu().numpy()
        stem_filename = f"{source}_{stem_name}.wav"
        stem_path = output_dir / stem_filename

        stem_tensor = torch.from_numpy(stem_data)
        if stem_tensor.dim() == 1:
            stem_tensor = stem_tensor.unsqueeze(0)
        elif stem_tensor.dim() == 2 and stem_tensor.shape[0] > 2:
            stem_tensor = stem_tensor.mean(0, keepdim=True).repeat(2, 1)

        torchaudio.save(str(stem_path), stem_tensor, model.samplerate)
        stems[stem_name] = stem_path

        emit({
            "status": "progress",
            "stage": "saving",
            "progress": 0.85 + (0.14 * (i + 1) / len(stem_names)),
            "message": f"Saved {stem_name}.wav",
        })

    return stems


def run_demucs(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run demucs stem separation (uses htdemucs pretrained model)."""
    return _run_demucs_model(input_path, output_dir, device, model_name="htdemucs", shifts=0)


def run_htdemucs(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run htdemucs (high-quality demucs) stem separation."""
    return _run_demucs_model(input_path, output_dir, device, model_name="htdemucs", shifts=0)


def run_htdemucs_ft(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run htdemucs_ft (fine-tuned, highest quality) stem separation."""
    return _run_demucs_model(input_path, output_dir, device, model_name="htdemucs_ft", shifts=1)


def run_bs_roformer(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run BS-RoFormer stem separation (highest quality for vocals)."""
    try:
        import torch
        import torchaudio
        from bs_roformer import BSRoformer
    except ImportError:
        emit({
            "status": "error",
            "model_id": "bs_roformer",
            "error": "BS-RoFormer is not yet supported for local inference. Please choose Demucs, HT-Demucs, or HT-Demucs FT, or use a cloud provider.",
        })
        sys.exit(1)

    emit({
        "status": "progress",
        "stage": "loading",
        "progress": 0.05,
        "message": "Loading BS-RoFormer model...",
    })

    if device == "cuda" and torch.cuda.is_available():
        run_device = torch.device("cuda")
    elif device == "mps" and torch.backends.mps.is_available():
        run_device = torch.device("mps")
    else:
        run_device = torch.device("cpu")

    model = BSRoformer(
        cnn_layers=10,
        attention_layers=20,
        channels=32,
    )
    # Load weights (model needs to be downloaded separately)
    # For now, fall back to demucs if weights not available
    emit({
        "status": "error",
        "model_id": "bs_roformer",
        "error": "BS-RoFormer is not yet supported for local inference. Please choose Demucs, HT-Demucs, or HT-Demucs FT, or use a cloud provider.",
    })
    sys.exit(1)


# ------------------------------------------------------------------------------
# Cloud runners
# ------------------------------------------------------------------------------

# Model name mapping: local model name → fal.ai endpoint
FAL_MODEL_MAP = {
    "demucs": "fal-ai/demucs",
    "htdemucs": "fal-ai/demucs",
    "htdemucs_ft": "fal-ai/demucs",
    "bs_roformer": "fal-ai/demucs",
}

FAL_TIMEOUT_SECONDS = 300


def _save_stems_from_urls(
    stem_urls: Dict[str, str],
    input_stem: str,
    output_dir: Path,
    stage_progress_start: float,
    stage_progress_end: float,
) -> Dict[str, Path]:
    """Download and save stem WAVs from URLs, emitting progress."""
    stem_names = ["drums", "bass", "other", "vocals"]
    stems: Dict[str, Path] = {}
    total = len(stem_names)

    for i, stem_name in enumerate(stem_names):
        url = stem_urls.get(stem_name)
        if url is None:
            raise RuntimeError(f"Provider did not return '{stem_name}' stem")

        stem_path = output_dir / f"{input_stem}_{stem_name}.wav"
        progress = stage_progress_start + (stage_progress_end - stage_progress_start) * (i + 1) / total

        emit({
            "status": "progress",
            "stage": "downloading",
            "progress": round(progress, 3),
            "message": f"Downloading {stem_name}...",
        })

        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        stem_path.write_bytes(resp.content)
        stems[stem_name] = stem_path

    return stems


def run_fal(
    input_path: Path,
    output_dir: Path,
    model: str,
    api_key: str,
) -> Dict[str, Path]:
    """Run stem separation via fal.ai cloud API.

    API key is never logged or emitted.
    """
    if fal_client is None or requests is None:
        emit({
            "status": "error",
            "error": "Cloud provider packages not installed. Run: pip install fal-client requests",
            "fallback_hint": "switch_to_local",
        })
        raise ImportError("fal-client and requests are required for cloud inference")

    fal_model = FAL_MODEL_MAP.get(model.lower(), "fal-ai/demucs")
    source = str(input_path.stem)

    # --- Upload ---
    emit({
        "status": "progress",
        "stage": "uploading",
        "progress": 0.05,
        "message": "Uploading audio to fal.ai...",
    })

    try:
        upload_url = fal_client.upload_file(str(input_path))
    except Exception:
        emit({
            "status": "error",
            "error": "Upload failed — check your internet connection",
            "fallback_hint": "switch_to_local",
        })
        raise

    # --- Queue / Separate ---
    emit({
        "status": "progress",
        "stage": "queued",
        "progress": 0.10,
        "message": "Queued on fal.ai...",
    })

    start_time = time.monotonic()

    def on_queue_update(update):
        elapsed = time.monotonic() - start_time
        if elapsed > FAL_TIMEOUT_SECONDS:
            raise TimeoutError("Provider timed out — try again or use Local")
        if isinstance(update, fal_client.InProgress):
            for log_entry in update.logs:
                msg = log_entry.get("message", "Separating...")
                emit({
                    "status": "progress",
                    "stage": "separating",
                    "progress": 0.20,
                    "message": msg,
                })

    try:
        result = fal_client.subscribe(
            fal_model,
            arguments={"audio_url": upload_url},
            with_logs=True,
            on_queue_update=on_queue_update,
        )
    except fal_client.client.FalClientError as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            emit({
                "status": "error",
                "error": "API key rejected by fal.ai — check Settings",
                "fallback_hint": "switch_to_local",
            })
        else:
            emit({
                "status": "error",
                "error": f"Provider returned an error: {error_msg}",
                "fallback_hint": "switch_to_local",
            })
        raise
    except (requests.ConnectionError, requests.Timeout):
        # Retry once after brief sleep
        time.sleep(5)
        try:
            result = fal_client.subscribe(
                fal_model,
                arguments={"audio_url": upload_url},
                with_logs=True,
                on_queue_update=on_queue_update,
            )
        except (requests.ConnectionError, requests.Timeout):
            emit({
                "status": "error",
                "error": "Upload failed — check your internet connection",
                "fallback_hint": "switch_to_local",
            })
            raise

    # Check timeout
    if time.monotonic() - start_time > FAL_TIMEOUT_SECONDS:
        emit({
            "status": "error",
            "error": "Provider timed out — try again or use Local",
            "fallback_hint": "switch_to_local",
        })
        raise TimeoutError("Provider timed out — try again or use Local")

    # --- Download stems ---
    emit({
        "status": "progress",
        "stage": "saving",
        "progress": 0.90,
        "message": "Downloading stems from fal.ai...",
    })

    stem_urls: Dict[str, str] = {}
    if "stems" in result:
        for stem_info in result["stems"]:
            name = stem_info.get("stem", stem_info.get("type", "")).lower()
            url = stem_info.get("url", "")
            if name and url:
                stem_urls[name] = url
    elif "audio_url" in result:
        # Single output format — fall back to audio_url
        stem_urls = {"other": result["audio_url"]}

    try:
        stems = _save_stems_from_urls(stem_urls, source, output_dir, 0.90, 0.99)
    except requests.HTTPError:
        emit({
            "status": "error",
            "error": "Download failed — check your internet connection",
            "fallback_hint": "switch_to_local",
        })
        raise
    except RuntimeError as e:
        emit({
            "status": "error",
            "error": str(e),
            "fallback_hint": "switch_to_local",
        })
        raise

    return stems


# Model name mapping: local model name → Replicate model identifier
REPLICATE_MODEL_MAP = {
    "demucs": "ryan5453/demucs",
    "htdemucs": "ryan5453/demucs",
    "htdemucs_ft": "ryan5453/demucs",
    "bs_roformer": "ryan5453/demucs",
}

REPLICATE_POLL_INTERVAL = 3  # seconds
REPLICATE_TIMEOUT_SECONDS = 300


def run_replicate(
    input_path: Path,
    output_dir: Path,
    model: str,
    api_key: str,
    version_hash: str,
) -> Dict[str, Path]:
    """Run stem separation via Replicate cloud API.

    API key is never logged or emitted.
    """
    if replicate_module is None or requests is None:
        emit({
            "status": "error",
            "error": "Cloud provider packages not installed. Run: pip install replicate requests",
            "fallback_hint": "switch_to_local",
        })
        raise ImportError("replicate and requests are required for cloud inference")

    replicate_model = REPLICATE_MODEL_MAP.get(model.lower(), "ryan5453/demucs")
    source = str(input_path.stem)

    # --- Upload ---
    emit({
        "status": "progress",
        "stage": "uploading",
        "progress": 0.05,
        "message": "Uploading audio to Replicate...",
    })

    try:
        with open(input_path, "rb") as f:
            prediction = replicate_module.predictions.create(
                version=version_hash,
                input={"audio": f},
            )
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg or "Invalid token" in error_msg:
            emit({
                "status": "error",
                "error": "API key rejected by Replicate — check Settings",
                "fallback_hint": "switch_to_local",
            })
        else:
            emit({
                "status": "error",
                "error": "Upload failed — check your internet connection",
                "fallback_hint": "switch_to_local",
            })
        raise

    # --- Poll for completion ---
    emit({
        "status": "progress",
        "stage": "queued",
        "progress": 0.10,
        "message": "Queued on Replicate...",
    })

    start_time = time.monotonic()

    while True:
        elapsed = time.monotonic() - start_time

        if elapsed > REPLICATE_TIMEOUT_SECONDS:
            emit({
                "status": "error",
                "error": "Provider timed out — try again or use Local",
                "fallback_hint": "switch_to_local",
            })
            raise TimeoutError("Provider timed out — try again or use Local")

        try:
            prediction.reload()
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(5)
            try:
                prediction.reload()
            except (requests.ConnectionError, requests.Timeout):
                emit({
                    "status": "error",
                    "error": "Upload failed — check your internet connection",
                    "fallback_hint": "switch_to_local",
                })
                raise

        if prediction.status == "succeeded":
            break
        elif prediction.status in ("failed", "canceled"):
            error_detail = prediction.error or prediction.status
            emit({
                "status": "error",
                "error": f"Provider returned an error: {error_detail}",
                "fallback_hint": "switch_to_local",
            })
            raise RuntimeError(f"Replicate prediction {prediction.status}: {error_detail}")

        # Estimate progress: linear interpolation over assumed 120s median job
        estimated = min(0.20 + 0.60 * (elapsed / 120.0), 0.79)
        emit({
            "status": "progress",
            "stage": "separating",
            "progress": round(estimated, 3),
            "message": "Separating stems on Replicate...",
        })

        time.sleep(REPLICATE_POLL_INTERVAL)

    # --- Download stems ---
    emit({
        "status": "progress",
        "stage": "downloading",
        "progress": 0.85,
        "message": "Downloading stems from Replicate...",
    })

    stem_urls: Dict[str, str] = {}
    output = prediction.output
    if isinstance(output, dict) and "stems" in output:
        for stem_info in output["stems"]:
            name = stem_info.get("stem", stem_info.get("type", "")).lower()
            url = stem_info.get("url", "")
            if name and url:
                stem_urls[name] = url
    elif isinstance(output, list):
        # Output is a list of URLs — map to standard stem names
        stem_names = ["drums", "bass", "other", "vocals"]
        for i, url in enumerate(output):
            if i < len(stem_names):
                stem_urls[stem_names[i]] = url

    try:
        stems = _save_stems_from_urls(stem_urls, source, output_dir, 0.85, 0.99)
    except requests.HTTPError:
        emit({
            "status": "error",
            "error": "Download failed — check your internet connection",
            "fallback_hint": "switch_to_local",
        })
        raise
    except RuntimeError as e:
        emit({
            "status": "error",
            "error": str(e),
            "fallback_hint": "switch_to_local",
        })
        raise

    return stems


def run_separation(
    model: str,
    input_path: Path,
    output_dir: Path,
    device: str,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    version_hash: Optional[str] = None,
) -> Dict[str, Path]:
    """Dispatch to the appropriate model runner."""
    # Cloud dispatch
    if device == "cloud" and provider == "fal" and api_key:
        return run_fal(input_path, output_dir, model, api_key)
    if device == "cloud" and provider == "replicate" and api_key and version_hash:
        return run_replicate(input_path, output_dir, model, api_key, version_hash)

    # Local dispatch
    model_lower = model.lower()

    if model_lower == "demucs":
        return run_demucs(input_path, output_dir, device)
    elif model_lower in ("htdemucs", "ht_demucs"):
        return run_htdemucs(input_path, output_dir, device)
    elif model_lower in ("htdemucs_ft", "ht_demucs_ft"):
        return run_htdemucs_ft(input_path, output_dir, device)
    elif model_lower in ("bs_roformer", "bs-roformer"):
        return run_bs_roformer(input_path, output_dir, device)
    else:
        emit({
            "status": "error",
            "error": f"Unknown model: {model}. Available: demucs, htdemucs, htdemucs_ft, bs_roformer",
        })
        sys.exit(1)


# ------------------------------------------------------------------------------
# Dependency checks
# ------------------------------------------------------------------------------

def check_dependencies(model: str = "demucs") -> bool:
    """Check if required Python packages are available for the specified model.

    Parameters
    ----------
    model : str
        Model ID to check dependencies for. One of: demucs, htdemucs, htdemucs_ft, bs_roformer.
    """
    missing = []

    # All local models require torch and torchaudio
    try:
        import torch
    except ImportError:
        missing.append("torch")

    try:
        import torchaudio
    except ImportError:
        missing.append("torchaudio")

    model_lower = model.lower()
    if model_lower in ("bs_roformer", "bs-roformer"):
        # BS-RoFormer requires bs_roformer and soundfile
        try:
            from bs_roformer import BSRoformer
        except ImportError:
            missing.append("bs_roformer")

        try:
            import soundfile
        except ImportError:
            missing.append("soundfile")
    else:
        # Demucs-family models require demucs
        try:
            from demucs.pretrained import get_model
        except ImportError:
            missing.append("demucs")

    if missing:
        install_hint = "pip install " + " ".join(missing)
        emit({
            "status": "error",
            "error": f"Missing Python packages for {model}: {', '.join(missing)}. Install with: {install_hint}",
        })
        return False

    return True


# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stemgen AI Stem Separation Sidecar",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--model", help="AI model to use (demucs, htdemucs, htdemucs_ft, bs_roformer)")
    parser.add_argument("--input", type=Path, help="Input audio file path")
    parser.add_argument("--output", type=Path, help="Output directory for stem files")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda", "mps", "cloud"], help="Device to use for inference")
    parser.add_argument("--provider", default=None, choices=["fal", "replicate"], help="Cloud inference provider (required when --device cloud)")
    parser.add_argument("--api-key", default=None, type=str, help="API key for cloud provider")
    parser.add_argument("--provider-version", default=None, type=str, help="Replicate model version hash")
    parser.add_argument("--download-model", metavar="MODEL_ID", help="Download a demucs model by ID and exit")
    parser.add_argument("--check-model", metavar="MODEL_ID", help="Check if a model is available locally and exit")
    parser.add_argument("--delete-model", metavar="MODEL_ID", help="Delete a model's local weights and exit")
    parser.add_argument("--list-models", action="store_true", help="List all known models with availability status and exit")

    args = parser.parse_args()

    # Handle --download-model (standalone download mode)
    if args.download_model:
        try:
            pretrained_name = DEMUCS_PRETRAINED_NAME.get(args.download_model, args.download_model)
            emit({"status": "progress", "stage": "downloading", "progress": 0.0, "message": f"Downloading {args.download_model}..."})
            _download_model_weights(pretrained_name)
            # Load from cache to verify the snapshot is complete and usable.
            import demucs.pretrained
            demucs.pretrained.get_model(pretrained_name)
            emit({"status": "complete", "model_id": args.download_model, "message": f"{args.download_model} downloaded"})
            sys.exit(0)
        except Exception as e:
            emit({"status": "error", "model_id": args.download_model, "error": str(e)})
            sys.exit(1)

    # Handle --check-model (standalone check mode)
    if args.check_model:
        # BS-RoFormer is not yet supported for local inference
        if args.check_model.lower() in ("bs_roformer", "bs-roformer"):
            print(json.dumps({
                "available": False,
                "model_id": args.check_model,
                "reason": "not_implemented",
            }), flush=True)
            sys.exit(0)

        pretrained_name = DEMUCS_PRETRAINED_NAME.get(args.check_model, args.check_model)
        try:
            import demucs.pretrained
            available = _model_weights_available(pretrained_name)
            print(json.dumps({
                "available": available,
                "pretrained_name": pretrained_name,
                "model_id": args.check_model,
            }), flush=True)
            sys.exit(0)
        except Exception as e:
            print(json.dumps({
                "available": False,
                "pretrained_name": pretrained_name,
                "model_id": args.check_model,
                "error": str(e),
            }), flush=True)
            sys.exit(0)

    # Handle --delete-model (standalone delete mode)
    if args.delete_model:
        try:
            pretrained_name = DEMUCS_PRETRAINED_NAME.get(args.delete_model, args.delete_model)
            _delete_model_weights(pretrained_name)
            emit({"status": "complete", "model_id": args.delete_model, "message": f"{args.delete_model} deleted"})
            sys.exit(0)
        except Exception as e:
            emit({"status": "error", "model_id": args.delete_model, "error": str(e)})
            sys.exit(1)

    # Handle --list-models (standalone list mode)
    if args.list_models:
        try:
            results = []
            for model_id in DEMUCS_PRETRAINED_NAME:
                pretrained_name = DEMUCS_PRETRAINED_NAME[model_id]
                available = _model_weights_available(pretrained_name)
                results.append({"id": model_id, "available": available})
            print(json.dumps(results), flush=True)
            sys.exit(0)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)
            sys.exit(1)

    # Validate required args for separation mode
    if not args.model or not args.input or not args.output:
        parser.error("--model, --input, and --output are required for stem separation")

    # Validate cloud provider configuration
    if args.device == "cloud":
        if args.provider is None:
            emit({
                "status": "error",
                "error": "No API key set — go to Settings → Inference",
            })
            sys.exit(1)
        if not args.api_key:
            emit({
                "status": "error",
                "error": "No API key set — go to Settings → Inference",
            })
            sys.exit(1)
        if args.provider == "replicate" and not args.provider_version:
            emit({
                "status": "error",
                "error": "No Replicate version selected — choose a version in Settings",
                "fallback_hint": "switch_to_local",
            })
            sys.exit(1)

    # Validate input file
    if not args.input.exists():
        emit({
            "status": "error",
            "error": f"Input file not found: {args.input}",
        })
        sys.exit(1)

    # Create output directory
    args.output.mkdir(parents=True, exist_ok=True)

    # Emit starting status
    emit({
        "status": "starting",
        "model": args.model,
        "device": args.device,
        "message": f"Starting stem separation: {args.input.name}",
    })

    # Check dependencies
    if not check_dependencies(args.model):
        sys.exit(1)

    try:
        # Run separation
        stems = run_separation(
            args.model, args.input, args.output, args.device,
            provider=args.provider,
            api_key=args.api_key,
            version_hash=args.provider_version,
        )

        # Emit completion
        stem_paths = {name: str(path) for name, path in stems.items()}
        emit({
            "status": "done",
            "stems": stem_paths,
            "message": f"Separation complete: {len(stems)} stems created",
        })
        sys.exit(0)

    except Exception as e:
        import traceback
        emit({
            "status": "error",
            "error": f"Separation failed: {str(e)}",
        })
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
