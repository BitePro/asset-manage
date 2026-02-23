# Stop Hunting for Assets: Asset Manage — Your Static Resource Hub in VS Code

> Images scattered everywhere? Fonts hard to find? Duplicates eating your disk? One extension, all sorted.

## Sound Familiar?

- Images, fonts, and media scattered across folders — finding one image means digging through dozens of paths
- To preview a font, you have to install it system-wide and open a design tool
- No idea which images are too large until the build slows down
- Duplicate images hogging space, but no easy way to spot them
- Want to peek at a PDF or Excel file? Switch to the default app and wait

If you nodded along, **Asset Manage** is for you.

## What Is Asset Manage?

Asset Manage is a VS Code extension that turns your sidebar into a **one-stop static asset hub**. It scans your workspace for images, media, fonts, Office documents, and more, groups them by type, and offers **built-in preview** and **duplicate detection**.

In short: **All your static assets, organized in one clear, usable sidebar.**

## Features at a Glance

### 📂 Categorized Sidebar

Auto-grouped by type: **Images**, **Media**, **Fonts**, **Office**, **Others**. Each category is further grouped by folder for quick navigation.

### 🔍 Large File Marking

Set a size threshold (e.g., 100KB, 1MB). Files above the threshold are highlighted so you can quickly spot space hogs.

### 🔄 Duplicate Image Detection

Content-based hashing finds duplicate images. Click "View duplicates" to see all copies and their locations — one click to reveal, easy to clean up.

### 👁️ Built-in Preview

- **Images**: Click to preview, with adjustable background brightness
- **PDF**: Page-by-page preview with previous/next controls
- **Word (docx)**: Rendered directly in the panel
- **Excel (xlsx)**: Multi-sheet support with table preview

No need to leave VS Code for most preview tasks.

### 🔤 Font Preview

Right-click a `.ttf` / `.otf` / `.woff` / `.woff2` font in the explorer, choose "Font Preview", and the sidebar jumps to that font and shows its glyphs. Adjust size, expand character sets — all in place.

### ⌨️ Quick Access

- Shortcut: `Ctrl+Alt+A` (Windows/Linux) or `Cmd+Alt+A` (macOS)
- Status bar shortcut
- Sidebar icon

### 🌐 Multi-language

Supports **Chinese** and **English** — switch anytime from the header dropdown.

## Who Is It For?

- **Frontend / full-stack devs**: Manage images and fonts in `assets`, `public`, `static`, etc.
- **Design collaboration**: Quickly preview fonts and images, check for duplicates or oversized files
- **Document projects**: Browse PDFs, Word, Excel in one place
- **Media projects**: Manage audio and video with in-panel playback

## Install & Use

1. Search for **Asset Manage** in the VS Code marketplace and install
2. Open any workspace
3. Click the Asset Manage icon in the activity bar, or use `Ctrl+Alt+A` / `Cmd+Alt+A`
4. Browse, search, and preview assets in the sidebar

Optional settings:

- `assetManage.scanInclude`: Glob patterns for files to include
- `assetManage.scanExclude`: Glob patterns to exclude (defaults: `node_modules`, `.git`, `dist`, `build`, etc.)

## Wrap-up

Asset Manage turns "where did I put that file?" into "it’s right there in the sidebar." Whether you’re coding, designing, or organizing docs, it’s built to save time.

If you’re tired of hunting for images, fonts, and documents, give Asset Manage a try — and let VS Code become your static asset hub.

---

**Project**: [GitHub - BitePro/asset-manage](https://github.com/BitePro/asset-manage)  
**License**: MIT
