# myAthena - Proctoring & Assessment Platform

 is an assessment and anti-cheating platform built with React, Vite, and Electron. It features hardware verification, acoustic detection, automated 5-second desktop screen recording, live proctor broadcasting, and kiosk lockdown.

## Core Features
- **Pre-Exam System Verification**: Live microphone acoustic VU meter, single-display enforcement, and fullscreen validation.
- **Kiosk Lockdown & Shortcut Interception**: Intercepts macOS `Command+Q` and `Ctrl+Q` with native confirmation modals to prevent accidental exits.
- **Automated 5-Second Screen Captures**: Compositor-level desktop screen recording every 5 seconds saved locally to `electron/screen_captures/`.
- **Live Proctor Web Broadcast**: Built-in HTTP server broadcasting real-time candidate screen streams at `http://localhost:3001/proctor`.
- **Silent Periodic Camera Snapshots**: Background webcam photos captured every 5 seconds into `electron/camera_feed/`.
- **Acoustic Analysis**: Web Audio API RMS time-domain voice activity detection for whisper and speech violation alerts.
- **Exam Completion & Capture Browser**: Submission screen featuring one-click inspection buttons for screen captures and camera folders.

## Architecture & Tech Stack
- **Frontend**: React 19, Vite
- **Desktop Shell**: Electron (CommonJS preload context bridge)
- **Audio Processing**: Web Audio API AnalyserNode

## Development & Run Commands
```bash
# 1. Install dependencies
npm install

# 2. Start Vite client dev server
npm run dev

# 3. Launch Electron desktop app
npm run electron:start
```
