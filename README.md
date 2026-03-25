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

- **Node.js** 20+
- **Rust** 1.70+ (with `cargo`)
- **FFmpeg** - Audio/video processing
- **SoX** - Audio format conversion
- **Python** 3.9+ (for AI models)
- **CUDA** (optional, for GPU acceleration on NVIDIA)

#### Quick Start

```bash
# Clone the repository
git clone https://github.com/zenla5/stemgen-gui.git
cd stemgen-gui

# Install dependencies
npm install

# Run type check and lint
npm run check
npm run lint

# Run tests
npm run test

# Start development server (frontend only)
npm run dev

# Start with Tauri (full app, requires Rust)
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Usage

1. **Launch the app** - The app will check for required dependencies (FFmpeg, SoX, Python, AI models)

2. **Add audio files** - Drag & drop files or click "Open Folder"

3. **Configure settings** - Choose your DJ software preset, AI model, and output format

4. **Process** - Click "Start Processing" to begin stem separation

5. **Export** - The `.stem.mp4` file will be created alongside the original

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start frontend dev server
npm run tauri:dev       # Start with Tauri (requires Rust)

# Building
npm run build           # Build frontend
npm run tauri:build     # Build Tauri app

# Quality checks
npm run check           # TypeScript type check
npm run lint            # ESLint linting
npm run lint:fix        # Auto-fix lint issues
npm run format          # Prettier formatting

# Testing
npm run test            # Unit tests
npm run test:watch      # Watch mode
npm run test:coverage    # With coverage report
npm run test:e2e        # E2E tests (requires app running)
npm run test:e2e:ui     # E2E tests with UI
```

### Architecture

The application is built with:

- **Tauri v2** - Desktop shell for cross-platform support
- **React 18** - Frontend UI framework
- **TypeScript** - Type-safe frontend code
- **Rust** - High-performance backend
- **Python sidecar** - AI model inference (demucs/bs_roformer)
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Vitest** - Unit testing
- **Playwright** - E2E testing

### Project Structure

```
stemgen-gui/
├── src/                      # React frontend
│   ├── components/           # React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── layout/         # AppShell, Sidebar, Header
│   │   ├── file-browser/   # File selection & drag-drop
│   │   ├── processing/     # Processing queue
│   │   ├── mixer/          # Stem mixer
│   │   └── settings/      # Settings panel
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand stores
│   ├── lib/                 # Utilities and types
│   └── __tests__/          # Tests
├── src-tauri/               # Rust backend
│   └── src/
│       ├── audio/           # Audio processing
│       ├── stems/           # NI stem packing
│       └── commands/       # Tauri IPC commands
├── python/                  # Python sidecar
├── .github/workflows/       # CI/CD pipelines
└── package.json
```

## CI/CD

The project uses GitHub Actions for CI/CD:

- **Frontend checks** (3 OSes) - Type check, lint, tests
- **Backend checks** (Linux) - Clippy, tests
- **Security audit** - npm audit, cargo audit
- **Release builds** - Windows, macOS (Intel + ARM), Linux

See `.github/workflows/` for details.

## Contributing

Contributions are welcome! Please read our guidelines and submit PRs.

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [stemgen](https://github.com/axeldelafosse/stemgen) - The original CLI tool
- [Demucs](https://github.com/facebookresearch/demucs) - AI stem separation
- [BS-RoFormer](https://github.com/axeldelafosse/BS-RoFormer) - High-quality stem separation
- [Native Instruments](https://www.native-instruments.com/) - NI Stem format specification
