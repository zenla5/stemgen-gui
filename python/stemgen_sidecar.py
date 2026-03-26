#!/usr/bin/env python3
"""
Stemgen Sidecar — AI Stem Separation Wrapper

A Python script that wraps demucs/bs_roformer for stem separation
and communicates with the Tauri frontend via JSON lines on stdout.

Usage:
    python stemgen_sidecar.py --model <model> --input <path> --output <dir> --device <cpu|cuda|mps>

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
from pathlib import Path
from typing import Dict, Optional

# ------------------------------------------------------------------------------
# JSON line output helper
# ------------------------------------------------------------------------------

def emit(data: dict) -> None:
    """Write a JSON line to stdout and flush."""
    print(json.dumps(data), flush=True)


# ------------------------------------------------------------------------------
# Model runners
# ------------------------------------------------------------------------------

def run_demucs(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run demucs stem separation."""
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    import torchaudio

    model_name = "htdemucs"
    emit({
        "status": "progress",
        "stage": "loading",
        "progress": 0.05,
        "message": f"Loading demucs model '{model_name}'...",
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

    # Load audio using demucs
    wav = AudioFile(input_path).read(streams=0)
    source = str(input_path.stem)

    emit({
        "status": "progress",
        "stage": "separating",
        "progress": 0.3,
        "message": "Running AI separation...",
    })

    # Apply model
    with torch.no_grad():
        mix = wav[0]
        if mix.shape[0] > 2:
            # Convert stereo to mono for demucs
            mix = mix.mean(0)
        mix = torch.from_numpy(mix).to(run_device)
        ref = mix.mean(0)
        mix = (mix - ref.mean()) / (ref.std() + 1e-8)
        mix = mix[None, None, ...]
        
        sources = apply_model(model, mix, device=run_device, shifts=0, progress=False)[0]

    emit({
        "status": "progress",
        "stage": "saving",
        "progress": 0.85,
        "message": "Saving stem files...",
    })

    # Source names from demucs (in order)
    source_names = model.sources
    stem_names = ["drums", "bass", "other", "vocals"]
    
    # Map demucs source order to our standard order
    # demucs default order: drums, bass, other, vocals
    stems: Dict[str, Path] = {}
    
    for i, stem_name in enumerate(stem_names):
        source_name = source_names[i]
        stem_data = sources[i].cpu().numpy()
        stem_filename = f"{source}_{stem_name}.wav"
        stem_path = output_dir / stem_filename

        # Convert to 44.1kHz stereo if needed
        stem_tensor = torch.from_numpy(stem_data)
        if stem_tensor.dim() == 1:
            stem_tensor = stem_tensor.unsqueeze(0)  # Add channel dim
        elif stem_tensor.dim() == 2 and stem_tensor.shape[0] > 2:
            # Mix down to mono then duplicate to stereo
            stem_tensor = stem_tensor.mean(0, keepdim=True).repeat(2, 1)
        
        # Resample to 44.1kHz if needed
        orig_sr = 44100  # demucs default
        target_sr = 44100
        if orig_sr != target_sr:
            stem_tensor = torchaudio.functional.resample(stem_tensor, orig_sr, target_sr)
        
        torchaudio.save(str(stem_path), stem_tensor, target_sr)
        stems[stem_name] = stem_path

        emit({
            "status": "progress",
            "stage": "saving",
            "progress": 0.85 + (0.14 * (i + 1) / len(stem_names)),
            "message": f"Saved {stem_name}.wav",
        })

    return stems


def run_htdemucs(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run htdemucs (high-quality demucs) stem separation."""
    # htdemucs is a demucs variant, use the same approach
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    import torchaudio

    model_name = "htdemucs"

    emit({
        "status": "progress",
        "stage": "loading",
        "progress": 0.05,
        "message": f"Loading htdemucs model...",
    })

    if device == "cuda" and torch.cuda.is_available():
        run_device = torch.device("cuda")
    elif device == "mps" and torch.backends.mps.is_available():
        run_device = torch.device("mps")
    else:
        run_device = torch.device("cpu")

    model = get_model(model_name, device=run_device)
    model.eval()

    emit({
        "status": "progress",
        "stage": "separating",
        "progress": 0.2,
        "message": "Running AI separation (htdemucs)...",
    })

    wav = AudioFile(input_path).read(streams=0)
    source = str(input_path.stem)

    with torch.no_grad():
        mix = wav[0]
        if mix.shape[0] > 2:
            mix = mix.mean(0)
        mix = torch.from_numpy(mix).to(run_device)
        ref = mix.mean(0)
        mix = (mix - ref.mean()) / (ref.std() + 1e-8)
        mix = mix[None, None, ...]
        sources = apply_model(model, mix, device=run_device, shifts=0, progress=False)[0]

    emit({
        "status": "progress",
        "stage": "saving",
        "progress": 0.85,
        "message": "Saving stem files...",
    })

    source_names = model.sources
    stem_names = ["drums", "bass", "other", "vocals"]
    stems: Dict[str, Path] = {}

    for i, stem_name in enumerate(stem_names):
        source_name = source_names[i]
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


def run_htdemucs_ft(input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Run htdemucs_ft (fine-tuned, highest quality) stem separation."""
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    import torchaudio

    model_name = "htdemucs_ft"

    emit({
        "status": "progress",
        "stage": "loading",
        "progress": 0.05,
        "message": f"Loading htdemucs_ft model (this may take a moment)...",
    })

    if device == "cuda" and torch.cuda.is_available():
        run_device = torch.device("cuda")
    elif device == "mps" and torch.backends.mps.is_available():
        run_device = torch.device("mps")
    else:
        run_device = torch.device("cpu")

    model = get_model(model_name, device=run_device)
    model.eval()

    emit({
        "status": "progress",
        "stage": "separating",
        "progress": 0.1,
        "message": "Running AI separation (htdemucs_ft, highest quality)...",
    })

    wav = AudioFile(input_path).read(streams=0)
    source = str(input_path.stem)

    with torch.no_grad():
        mix = wav[0]
        if mix.shape[0] > 2:
            mix = mix.mean(0)
        mix = torch.from_numpy(mix).to(run_device)
        ref = mix.mean(0)
        mix = (mix - ref.mean()) / (ref.std() + 1e-8)
        mix = mix[None, None, ...]
        sources = apply_model(model, mix, device=run_device, shifts=1, progress=False)[0]

    emit({
        "status": "progress",
        "stage": "saving",
        "progress": 0.85,
        "message": "Saving stem files...",
    })

    source_names = model.sources
    stem_names = ["drums", "bass", "other", "vocals"]
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


def run_separation(model: str, input_path: Path, output_dir: Path, device: str) -> Dict[str, Path]:
    """Dispatch to the appropriate model runner."""
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
    parser.add_argument("--model", required=True, help="AI model to use (demucs, htdemucs, htdemucs_ft, bs_roformer)")
    parser.add_argument("--input", required=True, type=Path, help="Input audio file path")
    parser.add_argument("--output", required=True, type=Path, help="Output directory for stem files")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda", "mps"], help="Device to use for inference")

    args = parser.parse_args()

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
        stems = run_separation(args.model, args.input, args.output, args.device)

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
