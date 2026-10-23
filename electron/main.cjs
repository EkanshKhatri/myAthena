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


  app.on("window-all-closed", () => {
    app.quit();
  });
}
