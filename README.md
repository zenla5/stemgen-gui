[![CI](https://github.com/zenla5/stemgen-gui/actions/workflows/ci.yml/badge.svg)](https://github.com/zenla5/stemgen-gui/actions/workflows/ci.yml)
[![Release](https://github.com/zenla5/stemgen-gui/actions/workflows/release.yml/badge.svg)](https://github.com/zenla5/stemgen-gui/releases/latest)
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/zenla5/stemgen-gui?include_prereleases&label=version)](https://github.com/zenla5/stemgen-gui/releases/latest)
[![GPL-3.0 License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)

# 🎛 Stemgen GUI

A free and open source (FOSS) streamlined end-to-end pipeline software to convert audio files (MP3, FLAC, WAV, OGG, etc.) into `.stem.mp4` files for use with DJ software like Traktor, rekordbox, Serato DJ, Mixxx, djay, and VirtualDJ.

## Screenshots

> **Screenshots will be added in v1.0.0.** The app features a clean, modern UI with dark/light theme support.

### App Overview
```
┌─────────────────────────────────────────────────────────────┐
│  🎛 Stemgen GUI                              [─] [□] [✕]   │
├────────────┬────────────────────────────────────────────────┤
│            │  📁 Drop audio files here or click to browse  │
│  📁 Files  │                                                │
│  🎚️ Mixer  │     [drag-drop zone with preview]             │
│  ⚙️ Settings│                                                │
│  📜 History│                                                │
│            │────────────────────────────────────────────────│
│  ⚡ Status │  Ready                          v0.1.0       │
└────────────┴────────────────────────────────────────────────┘
```

### Stem Mixer View
```
┌─────────────────────────────────────────────────────────────┐
│  Stem Mixer                              [▶ Play All]      │
├─────────────────────────────────────────────────────────────┤
│  🔴 Drums     ████████████████░░░░░  [🔇] [👁]  100%       │
│  🩵 Bass      ██████████░░░░░░░░░░░  [🔇] [👁]  80%        │
│  🟡 Other     ████████████████░░░░░  [🔇] [👁]  100%       │
│  🩷 Vocals    ████████░░░░░░░░░░░░░  [🔇] [👁]  60%        │
├─────────────────────────────────────────────────────────────┤
│  ▶️ 00:45 / 03:22    [═══════════●═══════════]            │
└─────────────────────────────────────────────────────────────┘
```

### Processing Pipeline
```
Audio File (MP3/FLAC/WAV/OGG)
        │
        ▼
┌───────────────────┐
│  ① Decode &      │  ← Rust Symphonia decoder
│     Resample      │     → 44.1kHz PCM
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  ② AI Separation  │  ← Python sidecar
│                   │     demucs / bs_roformer
│  Drums / Bass /   │     → 4 mono stems
│  Other / Vocals   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  ③ Preview &      │  ← Web Audio API
│     Mix (opt.)    │     per-stem volume/solo/mute
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  ④ Encode Stems  │  ← FFmpeg
│                   │     ALAC / AAC
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  ⑤ Pack NI Atom  │  ← Rust (native)
│                   │     [moov]→[udta]→[nmde]
│  .stem.mp4        │     JSON metadata + stem colors
└─────────┬─────────┘
          │
          ▼
   Ready for DJ Software
```

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

## 📥 Downloads

> **⚠️ Unsigned Code Notice:**
>
> This project does **not** use paid code-signing certificates for Windows (.exe/.msi) or macOS (.dmg) applications. This means:
> - **Windows SmartScreen** may show a warning. Click "More info" → "Run anyway" to proceed.
> - **macOS Gatekeeper** may block the app on first launch. Allow via System Settings → Privacy & Security → "Open Anyway".
> - Linux AppImages may require `chmod +x` before execution.
>
> Binaries are built via GitHub Actions. SHA256 checksums are provided with every release for verification.

### Latest Release (v1.0.9)

Download the installer for your platform below. All links point to the **latest GitHub release** — they are always up to date.

| Platform | Download |
|---|---|
| **Windows** | [.exe (NSIS installer)](https://github.com/zenla5/stemgen-gui/releases/latest/download/Stemgen-GUI_1.0.9_x64-setup.exe) · [.msi](https://github.com/zenla5/stemgen-gui/releases/latest/download/Stemgen-GUI_1.0.9_x64-setup.msi) |
| **macOS (Apple Silicon)** | [.dmg](https://github.com/zenla5/stemgen-gui/releases/latest/download/Stemgen-GUI_1.0.9_aarch64.dmg) |
| **Linux** | [.AppImage](https://github.com/zenla5/stemgen-gui/releases/latest/download/Stemgen-GUI_1.0.9_amd64.AppImage) · [.deb](https://github.com/zenla5/stemgen-gui/releases/latest/download/stemgen-gui_1.0.9_amd64.deb) · [.rpm](https://github.com/zenla5/stemgen-gui/releases/latest/download/stemgen-gui-1.0.9-1.x86_64.rpm) |

📌 **All releases:** [github.com/zenla5/stemgen-gui/releases](https://github.com/zenla5/stemgen-gui/releases)

### Verifying Downloads

Every release includes a `SHA256SUMS.txt` file listing the hash of each binary. Verify your download:

```bash
# Linux / macOS
shasum -a 256 Stemgen-GUI_1.0.9_amd64.AppImage
# Compare the output against the entry in SHA256SUMS.txt

# Windows (PowerShell)
Get-FileHash Stemgen-GUI_1.0.9_x64-setup.exe -Algorithm SHA256
# Compare against SHA256SUMS.txt
```

---

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
