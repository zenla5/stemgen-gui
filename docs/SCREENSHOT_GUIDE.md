# Screenshot Guide for README

This guide explains how to take screenshots for the Stemgen-GUI README.

## Required Screenshots

Create these 4 screenshots and save them to `docs/screenshots/`:

### 1. Main Window (`main-window.png`)
**What to capture:**
- The app after first run, showing the file browser
- Empty state with drag-and-drop zone visible
- Sidebar navigation visible on the left

**Steps:**
1. Run `npm run tauri:dev`
2. On first run, the FirstRunWizard may appear - dismiss it
3. Take screenshot of the main interface

### 2. Settings Panel (`settings-panel.png`)
**What to capture:**
- Settings panel open
- DJ software preset selection visible (Traktor, rekordbox, Serato, etc.)
- Output format options (ALAC/AAC)

**Steps:**
1. Click Settings in the sidebar
2. Take screenshot showing the settings options

### 3. Processing Queue (`processing-queue.png`)
**What to capture:**
- Processing queue with at least one file
- Progress indicators visible
- Status badges (pending, processing, completed)

**Steps:**
1. Add an audio file to the queue
2. Click "Start Processing" (will show model download if first time)
3. Take screenshot when processing is visible

### 4. Stem Mixer (`stem-mixer.png`)
**What to capture:**
- Stem mixer view
- 4 stem tracks (Drums, Bass, Other, Vocals) with volume sliders
- Mute/Solo buttons for each stem
- Master preview section

**Steps:**
1. After processing completes, click "Mix" or navigate to Mixer view
2. Take screenshot showing the mixer interface

## Tips for Good Screenshots

1. **Resolution**: Use 1920x1080 or higher
2. **Window size**: Maximize the window
3. **Dark/Light mode**: Use dark mode for better contrast
4. **Crop**: Trim any window decorations if desired
5. **Naming**: Save as PNG files

## Creating the Screenshots Directory

```bash
mkdir -p docs/screenshots
```

Then add the screenshots to Git:

```bash
git add docs/screenshots/
git commit -m "docs: Add README screenshots"
```
