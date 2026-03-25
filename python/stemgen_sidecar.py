#!/usr/bin/env python3
"""
Stemgen Python Sidecar - AI Stem Separation

This script wraps demucs and bs_roformer for stem separation.
It's managed as a subprocess by the Rust backend.

Usage:
    python stemgen_sidecar.py --model <model> --input <file> --output <dir> [--device <device>]
"""

import argparse
import json
import os
import sys
import signal
from pathlib import Path
from typing import Optional

# Optional imports for AI models
try:
    import torch
    DEMUCS_AVAILABLE = True
except ImportError:
    DEMUCS_AVAILABLE = False
    print("Warning: demucs not installed. Run: pip install demucs", file=sys.stderr)

try:
    from bs_roformer import separator
    BS_ROFORMER_AVAILABLE = True
except ImportError:
    BS_ROFORMER_AVAILABLE = False
    print("Warning: bs_roformer not installed. Run: pip install bs_roformer", file=sys.stderr)


class StemSeparator:
    """Handles AI-based stem separation."""
    
    STEM_NAMES = ["drums", "bass", "other", "vocals"]
    
    def __init__(self, model: str = "bs_roformer", device: Optional[str] = None):
        self.model = model
        self.device = device or self._detect_device()
        self.separator = None
        
    def _detect_device(self) -> str:
        """Detect the best available device for inference."""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    
    def _detect_cuda_device(self) -> int:
        """Detect NVIDIA GPU device."""
        if torch.cuda.is_available():
            return 0
        return -1
    
    def load_model(self):
        """Load the separation model."""
        if self.model == "demucs" and DEMUCS_AVAILABLE:
            self._load_demucs()
        elif self.model == "bs_roformer" and BS_ROFORMER_AVAILABLE:
            self._load_bs_roformer()
        else:
            raise RuntimeError(f"Model '{self.model}' not available. "
                             f"demucs={DEMUCS_AVAILABLE}, bs_roformer={BS_ROFORMER_AVAILABLE}")
    
    def _load_demucs(self):
        """Load Demucs model."""
        try:
            from demucs.pretrained import get_model
            self.separator = get_model(self.model)
            self.separator.eval()
            if self.device != "cpu":
                self.separator = self.separator.to(self.device)
            self._send_progress({"status": "ready", "model": "demucs"})
        except Exception as e:
            raise RuntimeError(f"Failed to load demucs model: {e}")
    
    def _load_bs_roformer(self):
        """Load BS-RoFormer model."""
        try:
            cuda_device = self._detect_cuda_device()
            self.separator = separator.BSSeparator(
                model_name=self.model,
                device=self.device,
                cuda_device=cuda_device,
            )
            self._send_progress({"status": "ready", "model": "bs_roformer"})
        except Exception as e:
            raise RuntimeError(f"Failed to load bs_roformer model: {e}")
    
    def separate(self, input_path: str, output_dir: str) -> dict:
        """
        Separate audio into stems.
        
        Args:
            input_path: Path to input audio file
            output_dir: Directory to save stems
            
        Returns:
            Dictionary with paths to separated stems
        """
        input_file = Path(input_path)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        self._send_progress({
            "status": "processing",
            "stage": "loading",
            "message": "Loading audio file..."
        })
        
        # Generate output stem filenames
        stem_paths = {}
        for name in self.STEM_NAMES:
            stem_paths[name] = str(output_path / f"{input_file.stem}_{name}.wav")
        
        # Run separation
        self._send_progress({
            "status": "processing",
            "stage": "separating",
            "message": f"Separating stems using {self.model}..."
        })
        
        if self.model == "demucs" and DEMUCS_AVAILABLE:
            return self._separate_demucs(input_path, stem_paths)
        elif self.model == "bs_roformer" and BS_ROFORMER_AVAILABLE:
            return self._separate_bs_roformer(input_path, stem_paths)
        else:
            raise RuntimeError(f"Unknown model: {self.model}")
    
    def _separate_demucs(self, input_path: str, stem_paths: dict) -> dict:
        """Separate using Demucs."""
        try:
            import torchaudio
            
            # Load audio
            waveform, sr = torchaudio.load(input_path)
            
            # Separate
            with torch.no_grad():
                sources = self.separator(waveform.unsqueeze(0))
            
            # Save each stem
            for idx, name in enumerate(self.STEM_NAMES):
                stem_waveform = sources[0, idx]
                torchaudio.save(stem_paths[name], stem_waveform.cpu(), sr)
                
                self._send_progress({
                    "status": "processing",
                    "stage": "saving",
                    "progress": (idx + 1) / len(self.STEM_NAMES),
                    "message": f"Saving {name}..."
                })
            
            return stem_paths
            
        except Exception as e:
            raise RuntimeError(f"Demucs separation failed: {e}")
    
    def _separate_bs_roformer(self, input_path: str, stem_paths: dict) -> dict:
        """Separate using BS-RoFormer."""
        try:
            return self.separator.separate(
                input_path,
                stem_paths=stem_paths,
                progress_callback=self._send_progress,
            )
        except Exception as e:
            raise RuntimeError(f"BS-RoFormer separation failed: {e}")
    
    def _send_progress(self, data: dict):
        """Send progress update to stdout (JSON lines format)."""
        print(json.dumps(data), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Stemgen Python Sidecar - AI Stem Separation")
    parser.add_argument("--model", default="bs_roformer", 
                       choices=["demucs", "htdemucs", "htdemucs_ft", "bs_roformer"],
                       help="Separation model to use")
    parser.add_argument("--input", required=True, help="Input audio file")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--device", default=None, 
                       choices=["cpu", "cuda", "mps"],
                       help="Device for inference")
    
    args = parser.parse_args()
    
    # Handle interrupt signals
    def signal_handler(signum, frame):
        print(json.dumps({"status": "cancelled"}), flush=True)
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Initialize separator
        sep = StemSeparator(model=args.model, device=args.device)
        
        # Send ready status
        print(json.dumps({
            "status": "initializing",
            "model": args.model,
            "device": sep.device
        }), flush=True)
        
        # Load model
        sep.load_model()
        
        # Run separation
        result = sep.separate(args.input, args.output)
        
        # Send completion
        print(json.dumps({
            "status": "completed",
            "stems": result
        }), flush=True)
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": str(e)
        }), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
