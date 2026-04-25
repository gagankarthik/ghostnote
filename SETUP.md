# Ghostnote — Setup & Deployment Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Running in Dev Mode](#running-in-dev-mode)
- [Building for Production](#building-for-production)
- [Distributing / Hosting the Installer](#distributing--hosting-the-installer)
- [API Keys](#api-keys)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [System Requirements](#system-requirements)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Rust toolchain
```powershell
winget install Rustlang.Rustup
# After install, restart terminal, then:
rustup default stable
rustup target add x86_64-pc-windows-msvc
```

### 2. Visual Studio Build Tools (C++ compiler — required by Rust on Windows)
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
# During install, select: "Desktop development with C++"
```

### 3. Node.js 18+
```powershell
winget install OpenJS.NodeJS.LTS
```

### 4. WebView2 runtime (usually pre-installed on Windows 11)
If missing: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

---

## Development Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd ghostnote

# 2. Install npm dependencies
npm install

# 3. Copy env template (optional — only needed for build-time overrides)
cp .env.example .env.local
```

### Icon generation (one-time, already done if icons exist)
The source image must be square. If you replace `src-tauri/icons/square-icon.png`:
```bash
npm run tauri -- icon src-tauri/icons/square-icon.png
```
> If your source image isn't square, crop it first:
> `node -e "require('sharp')('src.png').resize(512,512,{fit:'cover'}).toFile('square-icon.png',()=>{})"` (requires `npm i -D sharp`)

---

## Running in Dev Mode

```bash
npm run tauri dev
```

This starts the Vite dev server (port 1420) and the Tauri app simultaneously with hot-reload for frontend changes. Rust changes trigger a full recompile.

**First run** will take 3–5 minutes as Cargo compiles all dependencies. Subsequent runs are fast.

---

## Building for Production

```bash
npm run tauri build
```

Output locations:
| Artifact | Path |
|----------|------|
| Installer (NSIS `.exe`) | `src-tauri/target/release/bundle/nsis/Ghostnote_0.1.0_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/Ghostnote_0.1.0_x64_en-US.msi` |
| Portable executable | `src-tauri/target/release/ghostnote.exe` |

The `src-tauri/target/release/bundle/` folder is git-ignored (too large). Use GitHub Releases or a file host to distribute installers.

### Signed builds (optional but recommended for distribution)
Generate a self-signed key:
```bash
npm run tauri -- signer generate -w ~/.tauri/ghostnote.key
```
Set in `.env.local` (git-ignored):
```
TAURI_SIGNING_PRIVATE_KEY=<contents of ghostnote.key>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<your password>
```
Then rebuild. Tauri will embed a signature that enables auto-update verification.

---

## Distributing / Hosting the Installer

### Option A — GitHub Releases (recommended)
1. Build locally: `npm run tauri build`
2. Create a GitHub Release and upload both the `.exe` and `.msi` from `bundle/`
3. Users download and run the installer — no server required

### Option B — Self-hosted file server
Host the installer files on any static file host (Cloudflare R2, S3, Nginx):
```
https://yourhost.com/ghostnote/
  Ghostnote_0.1.0_x64-setup.exe
  Ghostnote_0.1.0_x64-setup.exe.sig   ← signature (if signing enabled)
  latest.json                           ← for auto-update
```

**`latest.json`** format for Tauri auto-updater:
```json
{
  "version": "0.1.0",
  "notes": "First release",
  "pub_date": "2026-04-24T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://yourhost.com/ghostnote/Ghostnote_0.1.0_x64-setup.exe",
      "signature": "<contents of .sig file>"
    }
  }
}
```
Then add to `tauri.conf.json`:
```json
"plugins": {
  "updater": {
    "endpoints": ["https://yourhost.com/ghostnote/latest.json"],
    "dialog": true
  }
}
```

### Option C — Portable ZIP (no installer)
Zip just the `.exe` and ship it. Users extract and run — no install step.

---

## API Keys

Keys are entered **inside the app** via the ⚙ Settings panel and persisted to disk automatically. They survive restarts.

Storage location: `%APPDATA%\com.ghostnote.app\settings.json` (never synced, local only)

| Key | Where to get | Used for |
|-----|-------------|---------|
| **OpenAI API Key** | https://platform.openai.com/api-keys | AI responses (gpt-4o-mini) |
| **Deepgram API Key** | https://console.deepgram.com/ | Real-time speech-to-text |

**Cost estimates (light daily use):**
- Deepgram: ~$0.0043/min (Nova-2) → ~$0.26/hour of audio
- OpenAI: ~$0.00015/1K input tokens → nearly free per query

---

## Features

### Recording
Captures system audio via WASAPI loopback — the audio playing through your speakers or headphones. This means it picks up whatever Zoom, Teams, or Meet is playing, without joining as a bot.

### AI Modes
| Mode | Behaviour |
|------|-----------|
| **Interview** | Detects questions and gives STAR-method talking points |
| **Meeting** | Suggests what to say, flags action items, asks clarifying questions |
| **Notes** | Extracts concise bullet points from each utterance |

### Screen Context (🖥 button)
When enabled, Ghostnote captures a screenshot at the moment you press Ask AI and includes it as visual context with the GPT-4o-mini request. Useful for code reviews, slide decks, or anything visible on screen.

> Screenshot is scaled to 1024px wide before sending — keeps API costs low.

### Auto-Ask AI
Toggle in Settings → **"Auto-ask AI after each utterance"**. When on, the AI panel updates automatically every time Deepgram finalises a sentence. Best used in Interview mode.

### Invisible Overlay
Uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` — a Windows 10 2004+ API that makes the window invisible to all screen-capture APIs: OBS, Zoom screenshare, Teams, Discord Go Live. Only the physical display shows it.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Trigger AI response from current transcript |
| `Ctrl+Shift+H` | Show / hide the overlay |

---

## System Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 10 version 2004 (build 19041) or later |
| Architecture | x64 |
| Audio | Any output device (speakers or headphones) |
| WebView2 | Pre-installed on Windows 11; installer available for Windows 10 |
| Internet | Required for Deepgram and OpenAI API calls |

---

## Troubleshooting

**"Deepgram API key not set"**
→ Open ⚙ Settings, paste your Deepgram key, click Save Keys.

**"Audio capture failed: COM init failed"**
→ Make sure no other exclusive-mode audio application has locked the device.

**Recording starts but no transcript appears**
→ Check that your audio is actually playing through the default output device. WASAPI loopback only captures the Windows default render device.

**Overlay visible in screenshare**
→ Requires Windows 10 build 19041+. Check `winver` — if below 19041, the exclusion API is unavailable.

**Screen capture returns black image**
→ Some GPU drivers block GDI screen capture when hardware acceleration is active. Try: Display Settings → Graphics → turn off "Hardware-accelerated GPU scheduling" and restart.

**Build fails: "icon not found"**
→ Run: `npm run tauri -- icon src-tauri/icons/square-icon.png`
→ The source must be a square PNG ≥ 512×512.

**Cargo takes forever on first build**
→ Normal — first compile downloads and builds all Rust crates. Subsequent builds are incremental and fast.

 Needs admin elevation. You need to do this manually — two options, pick whichever is easier:                                                                                                     
                                                                                          
  ---                                                                                                                                                                                              
  Option A — Run the initial build as Admin (one-time, then normal terminal works)                                                                                                                 
   
  1. Open PowerShell as Administrator (Start → search "PowerShell" → right-click → Run as administrator)                                                                                           
  2. Run:                                                                                                                                                                                        
  cd "C:\Users\gagan\Desktop\Projects\ghostnote\src-tauri"
  cargo check
  Once it compiles successfully, the build scripts are cached. Future npm run tauri dev from a normal terminal will work fine without needing admin.

  ---
  Option B — Add permanent Defender exclusions (admin, one-time)

  In the admin PowerShell:
  Add-MpPreference -ExclusionPath "C:\Users\gagan\rust-targets"
  Add-MpPreference -ExclusionPath "$env:USERPROFILE\.cargo"
  After this, cargo check / npm run tauri dev will work from any normal terminal permanently.

  ---
  Option C — If this is Windows 11 Smart App Control

  Settings → Privacy & Security → Windows Security → App & browser control → Smart App Control → Off

  Then retry cargo check from the normal terminal.