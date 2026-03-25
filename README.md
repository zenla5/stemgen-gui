# 🎛 Stemgen GUI

A free and open source (FOSS) streamlined end-to-end pipeline software to convert audio files (MP3, FLAC, WAV, OGG, etc.) into `.stem.mp4` files for use with DJ software like Traktor, rekordbox, Serato DJ, Mixxx, djay, and VirtualDJ.

## Features

- 🎵 **Drag & Drop** - Drop audio files directly onto the app
- 🔄 **Batch Processing** - Queue multiple files for sequential/parallel processing
- 📊 **Waveform Visualization** - Visualize waveforms and preview stems
- 🎚️ **Stem Mixer** - Solo/mute/volume control per stem before export
- 📦 **Stem Unpacking** - Extract stems from existing `.stem.mp4` files
- 🎯 **BPM & Key Detection** - Auto-detect and embed metadata
- 🎨 **Custom Stem Colors** - NI-compatible colors for hardware integration
- 📥 **Model Download Manager** - Download/update AI models from within the app
- 💾 **Export Presets** - Save frequently used settings
- 🌓 **Dark/Light Theme** - System-aware theming
- ⌨️ **Keyboard Shortcuts** - Power-user shortcuts for all actions
- 🔔 **Desktop Notifications** - Get notified when jobs complete
- 📜 **Processing History** - Log of past jobs with re-process capability

## Supported DJ Software

| DJ Software | Stem Order | Format |
|-------------|------------|--------|
| Traktor Pro | drums, bass, other, vocals | ALAC/AAC |
| rekordbox | drums, bass, other, vocals | AAC |
| Serato DJ | vocals, drums, bass, other | AAC |
| Mixxx | drums, bass, other, vocals | ALAC/AAC |
| djay | drums, bass, other, vocals | AAC |
| VirtualDJ | vocals, drums, bass, other | AAC |

## Supported AI Models

- **BS RoFormer** - High quality, medium speed
- **HTDemucs** - High quality, slow
- **HTDemucs (fine-tuned)** - Highest quality, slow
- **Demucs v4** - Medium quality, fast

## Installation

### Pre-built Installers

Download the latest release for your platform:

- **Windows**: `.exe` installer
- **macOS**: `.dmg` disk image
- **Linux**: `.deb`, `.AppImage`, or Flatpak

### Build from Source

#### Prerequisites

- Node.js 20+
- Rust 1.75+
- FFmpeg
- SoX
- Python 3.9+ (for AI models)
- CUDA (optional, for GPU acceleration)

#### Steps

```bash
# Clone the repository
git clone https://github.com/zenla5/stemgen-gui.git
cd stemgen-gui

# Install dependencies
npm install

# Build the app
npm run tauri:build
```

## Usage

1. **Launch the app** - The app will check for required dependencies (FFmpeg, SoX, Python, AI models)

2. **Add audio files** - Drag & drop files or click "Open Folder"

3. **Configure settings** - Choose your DJ software preset, AI model, and output format

4. **Process** - Click "Start Processing" to begin stem separation

5. **Export** - The `.stem.mp4` file will be created alongside the original

## Architecture

The application is built with:

- **Tauri v2** - Desktop shell for cross-platform support
- **React 18** - Frontend UI framework
- **TypeScript** - Type-safe frontend code
- **Rust** - High-performance backend
- **Python sidecar** - AI model inference (demucs/bs_roformer)

## Development

```bash
# Start development server
npm run tauri:dev

# Run tests
npm run test          # Unit tests
npm run test:e2e     # E2E tests
npm run test:coverage # With coverage report

# Lint and format
npm run lint          # Lint frontend
cargo clippy         # Lint backend
npm run format       # Format frontend
cargo fmt           # Format backend
```

## Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [stemgen](https://github.com/axeldelafosse/stemgen) - The original CLI tool
- [Demucs](https://github.com/facebookresearch/demucs) - AI stem separation
- [BS-RoFormer](https://github.com/axeldelafosse/BS-RoFormer) - High-quality stem separation
- [Native Instruments](https://www.native-instruments.com/) - NI Stem format specification
