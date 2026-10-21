import { useEffect, useState, useRef, useCallback } from "react";
import { reportViolation } from "../utils/api.js";
import { FaceAndAudioProctor } from "../utils/faceAndAudioProctor.js";

const VIOLATION_WEIGHTS = {
  "tab-switch": 15,
  "window-blur": 8,
  "exit-fullscreen": 15,
  "multiple-faces": 20,
  "no-face": 12,
  "gaze-away": 6,
  "excessive-noise": 6,
  "multi-monitor": 25,
};

export default function useProctoring({
  enabled,
  token,
  videoRef,
  mediaStream,
  maxViolations = 3,
}) {
  const [violationCount, setViolationCount] = useState(0);
  const [violations, setViolations] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [aiStatus, setAiStatus] = useState({
    faceCount: 1,
  });

  // Warning modal controls
  const [showWarning, setShowWarning] = useState(false);
  const [latestViolationType, setLatestViolationType] = useState("");

  const lastViolationTimeByType = useRef({});
  const lastGlobalViolationTime = useRef(0);
  const DEFAULT_COOLDOWN_MS = 3000;
  const GLOBAL_COOLDOWN_MS = 2500;

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  const recordViolation = useCallback(
    async (type, description) => {
      const now = Date.now();

      // Global cooldown: prevent simultaneous cascade of different violation types
      if (now - lastGlobalViolationTime.current < GLOBAL_COOLDOWN_MS) return;

      const lastTime = lastViolationTimeByType.current[type] || 0;
      if (now - lastTime < DEFAULT_COOLDOWN_MS) return;

      lastGlobalViolationTime.current = now;
      lastViolationTimeByType.current[type] = now;

      const desc = description || type;
      const entry = { type, description: desc, timestamp: now };

      setViolationCount((prev) => prev + 1);
      setViolations((prev) => [...prev, entry]);
      setLatestViolationType(type);
      setShowWarning(true);

      // Clear clipboard if available
      if (window.electronAPI && window.electronAPI.clearClipboard) {
        window.electronAPI.clearClipboard();
      }

      try {
        await reportViolation(token, type);
      } catch (err) {
        console.error("Failed to report violation:", err);
      }
    },
    [token]
  );

  // AI Face & Audio Proctoring Engine
  useEffect(() => {
    if (!enabled) return;

    const proctor = new FaceAndAudioProctor({
      videoElement: videoRef?.current || null,
      mediaStream,
      onViolation: (type, desc) => {
        recordViolation(type, desc);
      },
      onAudioLevel: (lvl) => {
        setAudioLevel(lvl);
      },
      onStatus: (status) => {
        setAiStatus((prev) => ({ ...prev, ...status }));
      },
    });

    proctor.start();

    return () => {
      proctor.stop();
    };
  }, [enabled, videoRef, mediaStream, recordViolation]);

  // OS & Hardware Events: Multi-monitor, Fullscreen exit
  useEffect(() => {
    if (!enabled) return;

    let unsubDisplays = null;
    if (window.electronAPI?.onDisplayChanged) {
      unsubDisplays = window.electronAPI.onDisplayChanged((count) => {
        if (count > 1) {
          recordViolation(
            "multi-monitor",
            "Secondary external display connected during exam"
          );
        }
      });
    }

    let unsubFS = null;
    if (window.electronAPI?.onFullscreenStatus) {
      unsubFS = window.electronAPI.onFullscreenStatus((status) => {
        if (!status) {
          recordViolation(
            "exit-fullscreen",
            "Candidate exited full screen mode"
          );
        }
      });
    }

    return () => {
      if (unsubDisplays) unsubDisplays();
      if (unsubFS) unsubFS();
    };
  }, [enabled, recordViolation]);

  // Browser Events: Tab switch, Blur, Fullscreen exit, Shortcuts
  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        recordViolation("tab-switch", "Exam window minimized or tab switched");
      }
    }

    function handleBlur() {
      recordViolation("window-blur", "Focus moved away from exam application");
    }

    function handleFullscreenChange() {
      const active = Boolean(
        document.fullscreenElement || document.webkitFullscreenElement
      );
      if (!active) {
        recordViolation(
          "exit-fullscreen",
          "Candidate exited full screen mode"
        );
      }
    }

    function handleContextMenu(e) {
      e.preventDefault();
    }

    function handleCopyCutPaste(e) {
      e.preventDefault();
    }

    function handleKeyDown(e) {
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (e.shiftKey && key === "i") {
          e.preventDefault();
          return;
        }
        if (key === "q") {
          e.preventDefault();
          if (!window.electronAPI) {
            const confirmed = window.confirm(
              "Do you want to quit the exam? Quitting now will terminate your session."
            );
            if (confirmed) {
              window.close();
            }
          }
          return;
        }
        if (["c", "v", "a", "p", "s", "u", "w"].includes(key)) {
          e.preventDefault();
          return;
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopyCutPaste);
    document.addEventListener("cut", handleCopyCutPaste);
    document.addEventListener("paste", handleCopyCutPaste);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopyCutPaste);
      document.removeEventListener("cut", handleCopyCutPaste);
      document.removeEventListener("paste", handleCopyCutPaste);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, recordViolation]);

  return {
    violationCount,
    violations,
    audioLevel,
    aiStatus,
    shouldAutoSubmit: violationCount >= maxViolations,
    latestViolationType,
    showWarning,
    dismissWarning,
  };
}
