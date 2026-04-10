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

    model = get_model(model_name, device=run_device)
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

        torchaudio.save(str(stem_path), stem_tensor, 44100)
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
    import torch
    import torchaudio
    import soundfile as sf

    try:
        from bs_roformer import BSRoformer
    except ImportError:
        emit({
            "status": "error",
            "error": "bs_roformer not installed. Install with: pip install bs-roformer",
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
        "error": "BS-RoFormer model weights not available. Please download from HuggingFace or use 'demucs' model.",
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

def check_dependencies() -> bool:
    """Check if required Python packages are available."""
    missing = []

    try:
        import torch
    except ImportError:
        missing.append("torch")

    try:
        import torchaudio
    except ImportError:
        missing.append("torchaudio")

    try:
        from demucs.pretrained import get_model
    except ImportError:
        missing.append("demucs")

    if missing:
        emit({
            "status": "error",
            "error": f"Missing Python packages: {', '.join(missing)}. Install with: pip install torch torchaudio demucs",
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

    args = parser.parse_args()

    # Handle --download-model (standalone download mode)
    if args.download_model:
        try:
            import demucs.pretrained
            print(f"Downloading model: {args.download_model}", flush=True)
            demucs.pretrained.get_model(args.download_model)
            print(f"Download complete: {args.download_model}", flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"Download failed: {e}", file=sys.stderr, flush=True)
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
    if not check_dependencies():
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
