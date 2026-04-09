"""Shared fixtures for stemgen sidecar tests."""

import sys
from pathlib import Path

import pytest

# Ensure the python package root is on sys.path so `import stemgen_sidecar` works
_package_root = str(Path(__file__).resolve().parent.parent)
if _package_root not in sys.path:
    sys.path.insert(0, _package_root)
