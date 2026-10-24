import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";

import SystemCheck from "./components/SystemCheck.jsx";
import MainExam from "./components/MainExam.jsx";
import QuestionPalette from "./components/QuestionPalette.jsx";
import ResultPage from "./components/ResultPage.jsx";
import ViolationWarning from "./components/ViolationWarning.jsx";

import { fetchQuestions, submitExam } from "./utils/api.js";
import useProctoring from "./hooks/useProctoring.js";

/*
  Page flow:
  systemCheck (hardware & fullscreen verification) → exam → result
*/

function App() {
  const hiddenVideoRef = useRef(null);
  const canvaRef = useRef(null);

  /* ── auth / session ── */
  const [token] = useState(() => "session_" + Date.now());
  const [studentName] = useState("Candidate");

  /* ── page state: start directly at systemCheck ── */
  const [page, setPage] = useState("systemCheck"); // systemCheck | exam | result

  /* ── setup ── */
  const [mediaStream, setMediaStream] = useState(null);
  const [screenshotCount, setScreenshotCount] = useState(0);
  const [proctorUrl, setProctorUrl] = useState("http://localhost:3001/proctor");

  useEffect(() => {
    if (window.electronAPI?.getProctorUrl) {
      window.electronAPI.getProctorUrl().then((url) => {
        if (url) setProctorUrl(url);
      });
    }
  }, []);

  /* ── exam ── */
  const [questions, setQuestions] = useState([]);
  const [examDuration, setExamDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());

  /* ── result ── */
  const [result, setResult] = useState(null);

  /* ── proctoring ── */
  const MAX_VIOLATIONS = 3;
  const {
    violationCount,
    violations,
    audioLevel,
    aiStatus,
    shouldAutoSubmit,
    latestViolationType,
    showWarning,
    dismissWarning,
  } = useProctoring({
    enabled: page === "exam",
    token,
    videoRef: hiddenVideoRef,
    mediaStream,
    maxViolations: MAX_VIOLATIONS,
  });

  /* ── system check complete with verified stream ── */
  async function handleSystemCheckComplete(stream) {
    if (stream) {
      setMediaStream(stream);
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = stream;
        hiddenVideoRef.current.play().catch(() => {});
      }
    }
    await handleStartTest();
  }

  /* ── fullscreen ── */
  async function handleFullscreen() {
    if (window.electronAPI?.setFullScreen) {
      await window.electronAPI.setFullScreen();
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      await document.documentElement.webkitRequestFullscreen();
    }
  }

  /* ── start test ── */
  async function handleStartTest() {
    // 1. Enforce Fullscreen check
    let isFS = Boolean(
      document.fullscreenElement || document.webkitFullscreenElement
    );
    if (window.electronAPI?.isFullScreen) {
      try {
        isFS = await window.electronAPI.isFullScreen();
      } catch {}
    }

    if (!isFS) {
      try {
        await handleFullscreen();
      } catch (err) {
        alert("Full screen mode is strictly required to start the exam.");
        return;
      }
    }

    if (window.electronAPI) {
      const res = await window.electronAPI.showRules();
      if (res !== 0) return; // User cancelled or multi-monitor blocked
      await window.electronAPI.setFullScreen();
      await window.electronAPI.startTest();
    }

    // Fetch questions from local question bank
    const data = await fetchQuestions(token);
    setQuestions(data.questions || []);
    setExamDuration(data.examDuration || 3600000);
    setTime(data.examDuration || 3600000);

    // Try to restore saved state
    if (window.electronAPI) {
      const saved = await window.electronAPI.loadState();
      if (saved && saved.token === token) {
        setAnswers(saved.answers || {});
        setMarkedForReview(new Set(saved.markedForReview || []));
        setCurrentIndex(saved.currentIndex || 0);
      }
    }

    setPage("exam");
  }

  /* ── timer ── */
  useEffect(() => {
    if (page !== "exam") return;

    const interval = setInterval(async () => {
      if (window.electronAPI) {
        const remaining = await window.electronAPI.getRemainingTime();
        setTime(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          handleSubmit(answers);
        }
      } else {
        setTime((prev) => {
          const next = prev - 1000;
          if (next <= 0) {
            clearInterval(interval);
            handleSubmit(answers);
            return 0;
          }
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [page, answers]);



  /* ── camera snapshot capture (every 5s during exam) ── */
  async function takeCameraPhoto() {
    const video = hiddenVideoRef.current;
    const canva = canvaRef.current;

    if (!video || !canva) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canva.width = video.videoWidth;
    canva.height = video.videoHeight;

    const ctx = canva.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const image = canva.toDataURL("image/png");

    if (window.electronAPI?.savePhoto) {
      try {
        await window.electronAPI.savePhoto(image);
      } catch (err) {
        console.warn("Failed to save camera snapshot:", err);
      }
    }
  }

  /* ── periodic screen capture & camera photo capture (every 5 seconds) ── */
  useEffect(() => {
    if (page !== "exam") return;
    if (!window.electronAPI) return;

    // Take initial captures on exam start
    takeExamScreenshot();
    takeCameraPhoto();

    const interval = setInterval(async () => {
      await takeExamScreenshot();
      await takeCameraPhoto();
    }, 5000);

    return () => clearInterval(interval);
  }, [page]);

  async function takeExamScreenshot() {
    if (window.electronAPI?.captureScreen) {
      try {
        const res = await window.electronAPI.captureScreen();
        if (res && res.count) {
          setScreenshotCount(res.count);
        } else {
          setScreenshotCount((prev) => prev + 1);
        }
      } catch (err) {
        console.warn("Screen capture failed:", err);
      }
    }
  }

  /* ── auto-save state (every 10s during exam) ── */
  useEffect(() => {
    if (page !== "exam") return;
    if (!window.electronAPI) return;

    const interval = setInterval(() => {
      window.electronAPI.saveState({
        token,
        answers,
        markedForReview: [...markedForReview],
        currentIndex,
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [page, answers, markedForReview, currentIndex, token]);

  /* ── auto-submit on max violations ── */
  useEffect(() => {
    if (shouldAutoSubmit && page === "exam") {
      handleSubmit(answers);
    }
  }, [shouldAutoSubmit]);

  /* ── submit exam ── */
  const handleSubmit = useCallback(
    async (finalAnswers) => {
      if (page === "result") return;

      const timeSpent = examDuration - time;

      const data = await submitExam(token, finalAnswers, timeSpent);
      setResult(data);
      setPage("result");

      if (window.electronAPI) {
        await window.electronAPI.clearState();
        await window.electronAPI.exitKiosk();
      }
    },
    [token, examDuration, time, page]
  );

  /* ── format time ── */
  function formatTimeLeft(ms) {
    if (ms <= 0) return "00:00:00";

    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");

    const minutes = Math.floor((ms / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");

    const hours = Math.floor(ms / (1000 * 60 * 60))
      .toString()
      .padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }

  return (
    <>
      {/* Floating Acoustic Proctoring Widget in corner during Exam */}
      {page === "exam" && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#0f172a",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: 12,
            padding: "10px 14px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="pulse-dot"></span>
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#94a3b8",
                letterSpacing: 0.5,
              }}
            >
              ACOUSTIC PROCTORING
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              🎙️ {audioLevel > 15 ? `Voice Input: ${audioLevel}%` : "Mic Active (Secure)"}
            </div>
          </div>
        </div>
      )}

      {/* Offscreen canvas for silent camera snapshot encoding */}
      <canvas ref={canvaRef} style={{ display: "none" }} />

      {/* Hidden offscreen video for proctoring analysis in background (NOT shown on screen) */}
      <video
        ref={(el) => {
          hiddenVideoRef.current = el;
          if (el) {
            el.defaultMuted = true;
            el.muted = true;
            el.playsInline = true;
            el.setAttribute("playsinline", "");
            el.setAttribute("muted", "");
            if (mediaStream && el.srcObject !== mediaStream) {
              el.srcObject = mediaStream;
            }
            el.play().catch(() => {});
          }
        }}
        autoPlay
        muted
        playsInline
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      {/* Violation warning modal */}
      {showWarning && page === "exam" && (
        <ViolationWarning
          violationCount={violationCount}
          maxViolations={MAX_VIOLATIONS}
          latestViolation={latestViolationType}
          onDismiss={dismissWarning}
        />
      )}

      {/* Pages: Starts directly at systemCheck */}
      {page === "systemCheck" && (
        <SystemCheck onComplete={handleSystemCheckComplete} />
      )}

      {page === "exam" && questions.length > 0 && (
        <div className="exam-page">
          <div className="exam-container">
            <div className="exam-header">
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <h3>Time Left: {formatTimeLeft(time)}</h3>

                {/* AI Proctoring Live Status */}
                <span className="live-ai-pill">
                  <span className="pulse-dot"></span> AI Proctoring Live
                </span>

                {/* Screen Share Live Broadcast Pill (Status Indicator) */}
                <span
                  className="live-screen-pill"
                  title={`Live Screen Broadcast: ${proctorUrl} • Automated snapshots active`}
                >
                  <span className="pulse-dot-red"></span>
                  🖥️ Screen Shared ({screenshotCount} captures • Live)
                </span>

                {/* Audio Level Meter */}
                {audioLevel > 15 && (
                  <span className="live-audio-pill">
                    🔊 Voice Activity: {audioLevel}%
                  </span>
                )}
              </div>

              <div className="exam-header-right">
                {/* Violation Counter Badge */}
                <div
                  className={`violation-badge ${
                    violationCount === 0
                      ? "violation-badge--safe"
                      : violationCount < MAX_VIOLATIONS
                        ? "violation-badge--warning"
                        : "violation-badge--danger"
                  }`}
                >
                  ⚠ {violationCount}/{MAX_VIOLATIONS} Flags
                </div>

                <button
                  className="end-test-btn"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to finish and submit the exam?"
                      )
                    ) {
                      handleSubmit(answers);
                    }
                  }}
                >
                  End Test
                </button>
              </div>
            </div>

            <div className="exam-body">
              <div className="exam-main">
                <MainExam
                  questions={questions}
                  currentIndex={currentIndex}
                  setCurrentIndex={setCurrentIndex}
                  answers={answers}
                  setAnswers={setAnswers}
                  markedForReview={markedForReview}
                  setMarkedForReview={setMarkedForReview}
                />
              </div>

              <QuestionPalette
                questions={questions}
                currentIndex={currentIndex}
                answers={answers}
                markedForReview={markedForReview}
                onJumpTo={setCurrentIndex}
              />
            </div>
          </div>
        </div>
      )}

      {page === "result" && <ResultPage />}
    </>
  );
}

export default App;
