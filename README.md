<div align="center">
  <img src="docs/logo.svg" alt="DocuMark AI Logo" width="128" height="128" />

  <h1>DocuMark AI Editor</h1>

  <p><strong>Offline-first document-to-Markdown conversion engine with a professional editor</strong></p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-1.1.0-58A6FF?style=flat-square&logo=github"/>
    <img alt="License" src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square"/>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows"/>
    <img alt="Python" src="https://img.shields.io/badge/python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white"/>
    <img alt="React" src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black"/>
    <img alt="Electron" src="https://img.shields.io/badge/electron-42-47848F?style=flat-square&logo=electron&logoColor=white"/>
  </p>

  <p>
    <a href="#-features">Features</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-installation">Installation</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-whats-new">What's New</a>
  </p>
</div>

---

## ⚡ Overview

**DocuMark AI Editor** is a privacy-first desktop application that converts complex documents — PDF, DOCX — into clean, structured Markdown optimized for AI workflows. It runs entirely offline using a local **Docling** engine and presents results in a professional split-view Markdown editor.

> **Your documents never leave your machine.** No cloud APIs. No telemetry.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔒 **100% Local Processing** | All conversion happens on-device via the embedded Docling engine |
| 📄 **Smart Table Handling** | Complex tables (merged cells, multi-row headers) are intelligently restructured into readable Markdown |
| 📝 **DOCX + PDF Support** | Handles both Word documents (direct XML parsing) and PDFs (ML-based layout recognition) |
| ✍️ **Professional MDEditor** | Notion-style split-view Markdown editor with syntax highlighting |
| 🎨 **Luxury UI** | Minimalist Luxury Blue / Neutral design built with Tailwind CSS |
| 🚀 **Desktop Native** | Packaged as a standalone Windows `.exe` — no Node or Python required to run |
| 🔗 **One-Click Launch** | `start.bat` starts the full stack in a single click |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Shell                          │
│                                                             │
│  ┌─────────────────────┐    HTTP    ┌────────────────────┐  │
│  │   React Frontend    │ ─────────► │   FastAPI Backend  │  │
│  │                     │            │                    │  │
│  │  • File Upload UI   │ ◄───────── │  • Docling Engine  │  │
│  │  • Progress Stepper │  Markdown  │  • PDF Pipeline    │  │
│  │  • MDEditor Preview │            │  • DOCX Pipeline   │  │
│  │  • Toolbar (Save/   │            │  • MD Cleaner      │  │
│  │    Copy/Download)   │            │                    │  │
│  └─────────────────────┘            └────────────────────┘  │
│                                              │               │
│                                       ┌─────▼──────┐        │
│                                       │  data/ dir │        │
│                                       └────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, `@uiw/react-md-editor`
- **Backend:** Python, FastAPI, Uvicorn, Docling
- **Desktop:** Electron 42, electron-builder (NSIS installer)
- **Conversion:** Docling with `TableFormerMode.ACCURATE` + custom post-processing

---

## 📦 Installation

### Option A — Desktop App (Recommended)

Download and run the installer:

```
frontend/release/DocuMark AI Setup 1.0.0.exe
```

> The installer bundles the Electron shell. The Python backend (`docling-env/`) must be present in the same directory as the project root.

### Option B — Development Mode

**Prerequisites:** Node.js 18+, Python 3.10+

```bash
# 1. Clone
git clone https://github.com/danghoangsqtt-sys/dhsystem_mdconverter.git
cd dhsystem_mdconverter

# 2. Setup Python environment
python -m venv docling-env
.\docling-env\Scripts\activate
pip install -r backend\requirements.txt

# 3. Install frontend dependencies
cd frontend
npm install

# 4. Run in development mode
npm run dev:electron
```

### Option C — Quick Launch (after setup)

```bash
# From project root — starts both FastAPI backend and serves the app
start.bat
```

---

## 🖥️ Usage

1. **Launch** DocuMark AI from the desktop shortcut or `start.bat`
2. **Upload** a PDF or DOCX file using the sidebar button
3. **Wait** for the conversion progress stepper to complete (~10–60s depending on file complexity)
4. **Review** the Markdown output in the split-view editor
5. **Edit** as needed, then **Save**, **Copy**, or **Download** the result

---

## 🔧 Build from Source

```bash
cd frontend

# Production Electron package (generates installer in frontend/release/)
npm run build:electron
```

Output: `frontend/release/DocuMark AI Setup 1.0.0.exe`

---

## 🆕 What's New

### v1.1.0 — 2026-05-18

**Critical Bug Fix — DOCX Table Content Loss**

DOCX files with complex tables (merged cells, multi-column layouts) were producing empty Markdown output due to three cascading bugs in the post-processing layer. All three have been fixed:

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Silent table drop | `_clean_tables()` fallback returned `""` on structured-list failure | Fallback now preserves original table |
| Wrong sub-header detection | 70% bold-cell threshold misclassified data rows | Changed to: only rows where **all** non-empty cells are bold |
| Aggressive empty-column removal | Header row excluded from emptiness check | Now checks **all** rows including header |

**Improvement:** Added explicit `WordFormatOption` config for DOCX files with explanatory comment on pipeline differences (DOCX = direct XML parsing, no ML needed).

---

## 📁 Project Structure

```
dhsystem_mdconverter/
├── backend/
│   └── src/
│       ├── main.py                    # FastAPI app + routes
│       └── services/
│           ├── docling_service.py     # Docling converter (PDF + DOCX)
│           └── markdown_cleaner.py    # Post-processing pipeline
├── frontend/
│   ├── electron/
│   │   ├── main.ts                    # Electron main process
│   │   └── preload.ts
│   ├── public/
│   │   └── favicon.svg                # App icon
│   └── src/
│       ├── App.tsx                    # Main app logic
│       ├── types.ts                   # TypeScript types
│       ├── components/
│       │   └── ProcessingStatus.tsx   # Progress stepper
│       └── services/
│           └── api.ts                 # Backend API calls
├── data/                              # Converted files (gitignored)
├── docs/
│   └── logo.svg                       # Project logo
├── .viepilot/                         # ViePilot project context
├── start.bat                          # One-click launch script
└── README.md
```

---

## 🛡️ Privacy & Security

- **No network calls** from the conversion engine
- **No telemetry** of any kind
- All uploaded files are processed locally and saved to `data/` within the project folder
- The application explicitly **does not write** to `C:\Users` or any system paths

---

<div align="center">
  <sub>Built with ❤️ using <strong>ViePilot Vibe Coding</strong> · <a href="https://github.com/danghoangsqtt-sys/dhsystem_mdconverter">GitHub</a></sub>
</div>
