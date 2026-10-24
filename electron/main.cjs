const {
  BrowserWindow,
  app,
  ipcMain,
  dialog,
  nativeTheme,
  desktopCapturer,
  screen,
  clipboard,
  session,
  systemPreferences,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

/* ──────────────────────────────────────
   Single Instance Lock
   ────────────────────────────────────── */
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  let win = null;
  let isQuittingAllowed = false;

  /* ──────────────────────────────────────
     Window
     ────────────────────────────────────── */
  function createWindow() {
    win = new BrowserWindow({
      width: 1100,
      height: 750,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
      },
    });

    win.loadURL("http://localhost:5173/");
    win.webContents.openDevTools({ mode: "detach" });

    // Monitor changes in display devices
    screen.on("display-added", () => {
      if (win && !win.isDestroyed()) {
        const count = screen.getAllDisplays().length;
        win.webContents.send("display-changed", count);
      }
    });

    screen.on("display-removed", () => {
      if (win && !win.isDestroyed()) {
        const count = screen.getAllDisplays().length;
        win.webContents.send("display-changed", count);
      }
    });

    // Monitor fullscreen exit/enter
    win.on("enter-full-screen", () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("fullscreen-status", true);
      }
    });

    win.on("leave-full-screen", () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("fullscreen-status", false);
      }
    });

    // Intercept Command+Q (macOS) / Ctrl+Q hardware keystrokes and confirm before quitting
    win.webContents.on("before-input-event", async (event, input) => {
      if (
        (input.meta || input.control) &&
        input.key.toLowerCase() === "q" &&
        input.type === "keyDown"
      ) {
        event.preventDefault();

        const choice = await dialog.showMessageBox(win, {
          type: "warning",
          title: "Quit Exam Warning",
          message: "Do you want to quit the exam?",
          detail:
            "Quitting before completing the assessment will terminate your exam session. Are you sure you want to quit?",
          buttons: ["Cancel", "Quit Exam"],
          defaultId: 0,
          cancelId: 0,
        });

        if (choice.response === 1) {
          isQuittingAllowed = true;
          app.quit();
        }
      }
    });
  }

  /* ──────────────────────────────────────
     Focus second-instance window
     ────────────────────────────────────── */
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  /* ──────────────────────────────────────
     Fullscreen / Kiosk
     ────────────────────────────────────── */
  ipcMain.handle("full-screen", () => {
    if (win) {
      win.setFullScreen(true);
      win.setKiosk(true);
      return true;
    }
    return false;
  });

  ipcMain.handle("is-full-screen", () => {
    if (!win) return false;
    return win.isFullScreen() || win.isKiosk();
  });

  /* ──────────────────────────────────────
     Multi-Monitor Detection
     ────────────────────────────────────── */
  ipcMain.handle("get-display-count", () => {
    return screen.getAllDisplays().length;
  });

  ipcMain.handle("get-displays", () => {
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
    }));
  });

  /* ──────────────────────────────────────
     Clipboard Purge
     ────────────────────────────────────── */
  ipcMain.handle("clear-clipboard", () => {
    try {
      clipboard.clear();
      return true;
    } catch {
      return false;
    }
  });

  /* ──────────────────────────────────────
     Timer
     ────────────────────────────────────── */
  let end_time = null;

  ipcMain.handle("start-test", () => {
    end_time = Date.now() + 60 * 60 * 1000; // 1 hour
  });

  ipcMain.handle("get-time", () => {
    if (!end_time) return 0;
    const remaining = end_time - Date.now();
    return remaining > 0 ? remaining : 0;
  });

  /* ──────────────────────────────────────
     Exam Rules Dialog
     ────────────────────────────────────── */
  ipcMain.handle("show-rules", async () => {
    const displays = screen.getAllDisplays();
    if (displays.length > 1) {
      await dialog.showMessageBox(win, {
        type: "error",
        title: "Multiple Displays Detected",
        message: `You have ${displays.length} displays connected.`,
        detail:
          "Please disconnect all external monitors and screen extenders before starting the exam.",
        buttons: ["OK"],
      });
      return 1; // cancel / rejected
    }

    const result = await dialog.showMessageBox(win, {
      type: "info",
      title: "Exam Rules & Anti-Cheating Protocol",
      message: "Please read the exam rules carefully.",
      detail: `
1. Camera and microphone must remain connected for proctoring verification.
2. The entire exam screen is shared live and automatically captured every 5s.
3. Only single-monitor setups are permitted (external screens blocked).
4. Do not switch tabs, minimize, or blur the exam window.
5. Voice activity detection will flag talking, whispering, or background speech.
6. Copy, paste, developer shortcuts, and right-click are strictly disabled.
7. Maximum 3 critical violations allowed before automatic termination.
      `.trim(),
      buttons: ["Accept", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });

    return result.response;
  });

  /* ──────────────────────────────────────
     Camera Photo Capture
     ────────────────────────────────────── */
  ipcMain.handle("save-photo", (event, image) => {
    const feedDir = path.join(__dirname, "camera_feed");
    if (!fs.existsSync(feedDir)) {
      fs.mkdirSync(feedDir, { recursive: true });
    }

    const imageData = image.split(",")[1];
    const filePath = path.join(feedDir, `photo-${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

    return filePath;
  });

  /* ──────────────────────────────────────
     Screen Recording & Live Screen Sharing
     ────────────────────────────────────── */
  let latestScreenshotBuffer = null;
  let screenshotCounter = 0;
  let proctorServerPort = 3001;

  function startProctorLiveServer() {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (req.url.startsWith("/live-screen.png") || req.url.startsWith("/live-screen")) {
        if (latestScreenshotBuffer) {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          });
          res.end(latestScreenshotBuffer);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("No screenshot captured yet. Waiting for exam to start.");
        }
      } else if (req.url === "/proctor" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>myAthena Live Exam Screen Proctor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
    }
    header {
      width: 100%;
      max-width: 1200px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #1e293b;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .screen-wrapper {
      width: 100%;
      max-width: 1200px;
      background: #020617;
      border-radius: 12px;
      border: 1px solid #334155;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 480px;
    }
    #screenImg {
      max-width: 100%;
      height: auto;
      display: block;
      object-fit: contain;
    }
    footer {
      margin-top: 18px;
      font-size: 13px;
      color: #64748b;
      display: flex;
      gap: 20px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: #f1f5f9;">myAthena Exam Screen Stream</h1>
      <p style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Candidate Screen Live Proctoring View (Auto-refreshing every 2s)</p>
    </div>
    <div style="display: flex; gap: 10px; align-items: center;">
      <span class="badge">
        <span class="pulse-dot"></span> LIVE SCREEN BROADCAST
      </span>
      <span id="counter" style="font-size: 13px; color: #94a3b8; font-weight: 500;">Screenshots saved: 0</span>
    </div>
  </header>
  <div class="screen-wrapper">
    <img id="screenImg" src="/live-screen.png?t=${Date.now()}" alt="Exam Screen Live Feed" />
  </div>
  <footer>
    <span>Auto-Refresh: Active (2s polling)</span>
    <span>•</span>
    <span>Stream URL: http://localhost:${proctorServerPort}/proctor</span>
  </footer>

  <script>
    let pollCount = 0;
    const img = document.getElementById("screenImg");
    const counterEl = document.getElementById("counter");

    setInterval(() => {
      pollCount++;
      img.src = "/live-screen.png?t=" + Date.now();
      counterEl.textContent = "Live polls: " + pollCount;
    }, 2000);
  </script>
</body>
</html>`);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(proctorServerPort, () => {
      console.log(`Live screen proctor stream running at http://localhost:${proctorServerPort}/proctor`);
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        proctorServerPort = 3002;
        server.listen(proctorServerPort);
      }
    });
  }

  startProctorLiveServer();

  ipcMain.handle("capture-screen", async () => {
    try {
      let screenshotBuffer = null;

      // 1. Try desktopCapturer for full desktop view
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1920, height: 1080 },
        });

        if (sources.length > 0 && !sources[0].thumbnail.isEmpty()) {
          screenshotBuffer = sources[0].thumbnail.toPNG();
        }
      } catch (e) {
        console.warn("desktopCapturer thumbnail error:", e);
      }

      // 2. Fallback to direct window compositor capture (reliable, native pixel-perfect)
      if (!screenshotBuffer && win && !win.isDestroyed()) {
        const image = await win.webContents.capturePage();
        screenshotBuffer = image.toPNG();
      }

      if (!screenshotBuffer) return null;

      latestScreenshotBuffer = screenshotBuffer;
      screenshotCounter++;

      const screenDir = path.join(__dirname, "screen_captures");
      if (!fs.existsSync(screenDir)) {
        fs.mkdirSync(screenDir, { recursive: true });
      }

      const filePath = path.join(screenDir, `screen-${Date.now()}.png`);
      fs.writeFileSync(filePath, screenshotBuffer);

      return {
        path: filePath,
        count: screenshotCounter,
        url: `http://localhost:${proctorServerPort}/proctor`,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error("Screen capture failed:", err);
      return null;
    }
  });

  ipcMain.handle("get-proctor-url", () => {
    return `http://localhost:${proctorServerPort}/proctor`;
  });

  ipcMain.handle("get-screenshot-count", () => {
    return screenshotCounter;
  });

  ipcMain.handle("open-screenshots-folder", () => {
    const screenDir = path.join(__dirname, "screen_captures");
    if (!fs.existsSync(screenDir)) {
      fs.mkdirSync(screenDir, { recursive: true });
    }
    shell.openPath(screenDir);
    return true;
  });

  ipcMain.handle("open-camera-folder", () => {
    const feedDir = path.join(__dirname, "camera_feed");
    if (!fs.existsSync(feedDir)) {
      fs.mkdirSync(feedDir, { recursive: true });
    }
    shell.openPath(feedDir);
    return true;
  });

  /* ──────────────────────────────────────
     State Persistence (crash recovery)
     ────────────────────────────────────── */
  const stateFile = path.join(__dirname, "exam_state.json");

  ipcMain.handle("save-state", (_, state) => {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    return true;
  });

  ipcMain.handle("load-state", () => {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, "utf-8");
      return JSON.parse(data);
    }
    return null;
  });

  ipcMain.handle("clear-state", () => {
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
    return true;
  });

  /* ──────────────────────────────────────
     Export Audit Report to PDF
     ────────────────────────────────────── */
  ipcMain.handle("export-pdf", async () => {
    if (!win) return null;
    try {
      const pdfPath = path.join(
        app.getPath("documents"),
        `Athena_Audit_Report_${Date.now()}.pdf`
      );
      const data = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
      });
      fs.writeFileSync(pdfPath, data);
      return pdfPath;
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      return null;
    }
  });

  /* ──────────────────────────────────────
     Exit Kiosk & Quit App
     ────────────────────────────────────── */
  ipcMain.handle("exit-kiosk", () => {
    if (win) {
      win.kiosk = false;
    }
  });

  ipcMain.handle("quit-app", () => {
    isQuittingAllowed = true;
    app.quit();
  });

  /* ──────────────────────────────────────
     App Ready
     ────────────────────────────────────── */
  app.whenReady().then(async () => {
    nativeTheme.themeSource = "system";

    // Grant media permissions for camera, microphone, and screen capture
    if (session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback) => {
          if (
            [
              "media",
              "camera",
              "microphone",
              "display-capture",
              "notifications",
            ].includes(permission)
          ) {
            return callback(true);
          }
          callback(true);
        }
      );

      session.defaultSession.setPermissionCheckHandler(
        (webContents, permission) => {
          return true;
        }
      );
    }

    // On macOS, explicitly request hardware access permissions for camera & microphone
    if (process.platform === "darwin" && systemPreferences.askForMediaAccess) {
      try {
        await systemPreferences.askForMediaAccess("camera");
        await systemPreferences.askForMediaAccess("microphone");
      } catch (err) {
        console.warn("macOS media access check error:", err);
      }
    }

    createWindow();
  });

  app.on("before-quit", async (event) => {
    if (isQuittingAllowed) return;

    event.preventDefault();

    if (win && !win.isDestroyed()) {
      const choice = await dialog.showMessageBox(win, {
        type: "warning",
        title: "Quit Exam Warning",
        message: "Do you want to quit the exam?",
        detail:
          "Quitting before completing the assessment will terminate your exam session. Are you sure you want to quit?",
        buttons: ["Cancel", "Quit Exam"],
        defaultId: 0,
        cancelId: 0,
      });

      if (choice.response === 1) {
        isQuittingAllowed = true;
        app.quit();
      }
    } else {
      isQuittingAllowed = true;
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
