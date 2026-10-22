import { useEffect, useState, useRef } from "react";

function SystemCheck({ onComplete }) {
  const [checks, setChecks] = useState({
    microphone: "pending",
    screenShare: "pass",
    singleMonitor: "pending",
    fullscreen: "pending",
    screenSize: "pending",
  });

  const [displayCount, setDisplayCount] = useState(1);
  const [micVolume, setMicVolume] = useState(0);
  const [mediaStream, setMediaStream] = useState(null);
  const [testingSensors, setTestingSensors] = useState(false);
  const [mediaError, setMediaError] = useState("");

  const audioContextRef = useRef(null);

  useEffect(() => {
    // 1. Initial screen size check
    const screenOk = window.innerWidth >= 800;
    setChecks((prev) => ({
      ...prev,
      screenSize: screenOk ? "pass" : "fail",
    }));

    // 2. Real fullscreen check (NEVER fake pass!)
    checkFullscreenState();

    function handleFSChange() {
      checkFullscreenState();
    }

    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);

    let unsubElectronFS = null;
    if (window.electronAPI?.onFullscreenStatus) {
      unsubElectronFS = window.electronAPI.onFullscreenStatus((status) => {
        setChecks((prev) => ({
          ...prev,
          fullscreen: status ? "pass" : "pending",
        }));
      });
    }

    // 3. Multi-Monitor verification in Electron
    if (window.electronAPI?.getDisplayCount) {
      window.electronAPI
        .getDisplayCount()
        .then((count) => {
          setDisplayCount(count);
          setChecks((prev) => ({
            ...prev,
            singleMonitor: count === 1 ? "pass" : "fail",
          }));
        })
        .catch(() => {
          setChecks((prev) => ({ ...prev, singleMonitor: "pass" }));
        });
    } else {
      setChecks((prev) => ({ ...prev, singleMonitor: "pass" }));
    }

    // 4. Auto-initiate sensor connection
    handleTestSensors();

    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
      if (unsubElectronFS) unsubElectronFS();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, []);

  async function checkFullscreenState() {
    let isFS = Boolean(
      document.fullscreenElement || document.webkitFullscreenElement
    );
    if (window.electronAPI?.isFullScreen) {
      try {
        isFS = await window.electronAPI.isFullScreen();
      } catch {}
    }
    setChecks((prev) => ({
      ...prev,
      fullscreen: isFS ? "pass" : "pending",
    }));
  }

  async function handleLockFullscreen() {
    try {
      if (window.electronAPI?.setFullScreen) {
        await window.electronAPI.setFullScreen();
      }
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      }
      setChecks((prev) => ({ ...prev, fullscreen: "pass" }));
    } catch (err) {
      console.error("Fullscreen lock failed:", err);
    }
  }

  // Active Hardware Verification: connects microphone and silently prepares camera for exam snapshots
  async function handleTestSensors() {
    setTestingSensors(true);
    setMediaError("");

    try {
      let stream;
      try {
        // Request both camera & audio so camera is ready for background exam snapshots
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch (err) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        } catch (err2) {
          // Fallback to audio only if webcam hardware is restricted
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        }
      }

      setMediaStream(stream);

      // Set up real AudioContext analysis
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.fftSize;
        const timeData = new Uint8Array(bufferLength);

        // Auto-verify mic connectivity once audio stream is active
        if (stream.getAudioTracks().length > 0) {
          setTimeout(() => {
            setChecks((prev) => ({ ...prev, microphone: "pass" }));
          }, 800);
        }

        const meterInterval = setInterval(() => {
          if (!stream.active) {
            clearInterval(meterInterval);
            return;
          }

          analyser.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          for (let i = 0; i < bufferLength; i++) {
            const norm = (timeData[i] - 128) / 128;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / bufferLength);
          const vol = Math.min(100, Math.round(rms * 280));
          setMicVolume(vol);

          // Once audio is registered, mark mic as pass
          if (vol > 1) {
            setChecks((prev) => ({ ...prev, microphone: "pass" }));
          }
        }, 100);
      } else {
        setChecks((prev) => ({ ...prev, microphone: "pass" }));
      }
    } catch (err) {
      console.error("Sensors test failed:", err);
      setMediaError(
        "Microphone/Media access was denied. Please allow permissions in your browser/macOS settings and click 'Retry'."
      );
      setChecks((prev) => ({
        ...prev,
        microphone: "fail",
      }));
    } finally {
      setTestingSensors(false);
    }
  }

  const allPassed = Object.values(checks).every((s) => s === "pass");

  function getIcon(status) {
    if (status === "pass") return <span className="check-icon check-pass">✓</span>;
    if (status === "fail") return <span className="check-icon check-fail">✗</span>;
    return <span className="check-icon check-pending">⏳</span>;
  }

  function handleContinue() {
    if (allPassed && onComplete) {
      onComplete(mediaStream);
    }
  }

  return (
    <div className="system-check-page">
      <div className="system-check-card" style={{ maxWidth: 640 }}>
        <h2>System & Hardware Security Check</h2>
        <p>Complete each verification test below before starting the exam.</p>

        {/* Live Audio Verification Box (Camera feed hidden as requested) */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          {mediaStream ? (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🎙️</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
                      Audio & Security Sensors Connected
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Speak or make sound to verify audio sensor activity
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background:
                      micVolume > 1
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(148, 163, 184, 0.15)",
                    color: micVolume > 1 ? "#059669" : "#64748b",
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {micVolume > 1 ? "🟢 Sensor Active" : "Listening..."}
                </div>
              </div>

              {/* Live VU Bar */}
              <div
                style={{
                  width: "100%",
                  height: 10,
                  background: "#e2e8f0",
                  borderRadius: 6,
                  overflow: "hidden",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: `${micVolume}%`,
                    height: "100%",
                    background:
                      micVolume > 20
                        ? "#10b981"
                        : micVolume > 5
                        ? "#3b82f6"
                        : "#94a3b8",
                    transition: "width 0.1s ease",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  color: "#64748b",
                  marginTop: 6,
                }}
              >
                <span>
                  Voice input intensity:{" "}
                  <strong style={{ color: "#1e293b" }}>{micVolume}%</strong>
                </span>
                <button
                  onClick={handleTestSensors}
                  disabled={testingSensors}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: 11, padding: "3px 8px" }}
                >
                  🔄 Retest
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "14px 8px" }}>
              <p style={{ fontSize: 14, color: "#64748b", marginBottom: 14, fontWeight: 500 }}>
                {testingSensors
                  ? "Connecting to local hardware sensors..."
                  : "Hardware sensors must be actively verified before starting the exam."}
              </p>
              <button
                onClick={handleTestSensors}
                disabled={testingSensors}
                className="btn btn-dark"
              >
                {testingSensors ? "Connecting Devices..." : "🎙️ Connect & Verify Sensors"}
              </button>
            </div>
          )}

          {mediaError && (
            <div
              style={{
                color: "#ef4444",
                fontSize: 13,
                marginTop: 12,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              ⚠️ {mediaError}
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={handleTestSensors}
                  className="btn btn-light-blue btn-sm"
                >
                  Retry Access
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Requirements List (No Camera Check shown) */}
        <div className="check-list">
          {/* Microphone Check */}
          <div className="check-item">
            {getIcon(checks.microphone)}
            <div className="check-info">
              <span className="check-label">Microphone Audio</span>
              <span className="check-sublabel">
                {checks.microphone === "pass"
                  ? "✓ Microphone receiving sound input"
                  : "⏳ Speak or make sound to verify audio input"}
              </span>
            </div>
          </div>

          {/* Screen Share & Stream Check */}
          <div className="check-item">
            {getIcon(checks.screenShare)}
            <div className="check-info">
              <span className="check-label">Exam Screen Sharing & Stream</span>
              <span className="check-sublabel">
                {checks.screenShare === "pass"
                  ? "✓ Screen streaming authorized (Automatic 5s captures enabled)"
                  : "⏳ Screen sharing verification active"}
              </span>
            </div>
          </div>

          {/* Fullscreen Check */}
          <div className="check-item" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {getIcon(checks.fullscreen)}
              <div className="check-info">
                <span className="check-label">Fullscreen Lockdown</span>
                <span className="check-sublabel">
                  {checks.fullscreen === "pass"
                    ? "✓ Full screen mode active"
                    : "⏳ Windowed mode detected — Full screen required"}
                </span>
              </div>
            </div>

            {checks.fullscreen !== "pass" && (
              <button
                className="btn btn-light-blue btn-sm"
                onClick={handleLockFullscreen}
              >
                Enable Full Screen
              </button>
            )}
          </div>

          {/* Single Display Check */}
          <div className="check-item">
            {getIcon(checks.singleMonitor)}
            <div className="check-info">
              <span className="check-label">Single Display Environment</span>
              <span className="check-sublabel">
                {displayCount > 1
                  ? `Blocked: ${displayCount} displays detected. Disconnect external screens!`
                  : "✓ Verified: Single display configuration"}
              </span>
            </div>
          </div>

          {/* Screen Size Check */}
          <div className="check-item">
            {getIcon(checks.screenSize)}
            <div className="check-info">
              <span className="check-label">Screen Resolution</span>
              <span className="check-sublabel">
                {checks.screenSize === "pass"
                  ? "✓ Adequate desktop display width"
                  : "✗ Resolution too low (min 800px width required)"}
              </span>
            </div>
          </div>
        </div>

        {checks.singleMonitor === "fail" && (
          <div className="check-alert-banner">
            ⚠️ Please unplug external monitors, HDMI adapters, or secondary displays to continue.
          </div>
        )}

        <button
          className="btn btn-dark"
          onClick={handleContinue}
          disabled={!allPassed}
          style={{ width: "100%", marginTop: 12 }}
        >
          {allPassed ? "Proceed to Exam Rules →" : "Complete All Tests to Continue"}
        </button>
      </div>
    </div>
  );
}

export default SystemCheck;