const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Fullscreen / Kiosk
  setFullScreen: () => ipcRenderer.invoke("full-screen"),
  isFullScreen: () => ipcRenderer.invoke("is-full-screen"),
  onFullscreenStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("fullscreen-status", handler);
    return () => ipcRenderer.removeListener("fullscreen-status", handler);
  },
  exitKiosk: () => ipcRenderer.invoke("exit-kiosk"),

  // Multi-Monitor Security
  getDisplayCount: () => ipcRenderer.invoke("get-display-count"),
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  onDisplayChanged: (callback) => {
    const handler = (_, count) => callback(count);
    ipcRenderer.on("display-changed", handler);
    return () => ipcRenderer.removeListener("display-changed", handler);
  },

  // Clipboard
  clearClipboard: () => ipcRenderer.invoke("clear-clipboard"),

  // Timer
  getRemainingTime: () => ipcRenderer.invoke("get-time"),
  startTest: () => ipcRenderer.invoke("start-test"),

  // Exam rules
  showRules: () => ipcRenderer.invoke("show-rules"),

  // Screen Capture & Live Proctor Stream
  savePhoto: (image) => ipcRenderer.invoke("save-photo", image),
  captureScreen: () => ipcRenderer.invoke("capture-screen"),
  getProctorUrl: () => ipcRenderer.invoke("get-proctor-url"),
  getScreenshotCount: () => ipcRenderer.invoke("get-screenshot-count"),
  openScreenshotsFolder: () => ipcRenderer.invoke("open-screenshots-folder"),
  openCameraFolder: () => ipcRenderer.invoke("open-camera-folder"),

  // State persistence (crash recovery)
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  loadState: () => ipcRenderer.invoke("load-state"),
  clearState: () => ipcRenderer.invoke("clear-state"),

  // PDF Export
  exportPDF: () => ipcRenderer.invoke("export-pdf"),

  // Application Lifecycle
  quitApp: () => ipcRenderer.invoke("quit-app"),
});
