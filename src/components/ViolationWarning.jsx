function ViolationWarning({
  violationCount,
  maxViolations,
  latestViolation,
  onDismiss,
}) {
  function getDescription(type) {
    switch (type) {
      case "exit-fullscreen":
        return "You exited full screen mode. The exam strictly requires full screen.";
      case "tab-switch":
        return "You minimized or navigated away from the exam window.";
      case "window-blur":
        return "Focus moved away from the exam application.";
      case "no-face":
        return "No candidate face detected. Please face the webcam directly.";
      case "multiple-faces":
        return "Multiple individuals detected in camera frame. Malpractice flagged.";
      case "gaze-away":
        return "Candidate attention drift detected. Please look straight at the screen.";
      case "excessive-noise":
        return "Suspicious acoustic activity or background speech detected.";
      case "multi-monitor":
        return "Secondary display detected. Disconnect all external monitors immediately.";
      case "copy":
      case "cut":
      case "paste":
        return "Clipboard actions are strictly prohibited during the exam.";
      default:
        return "A proctoring integrity violation was detected.";
    }
  }

  const isFinalWarning = violationCount >= maxViolations;

  async function handleDismiss() {
    // If it was a fullscreen violation, re-lock into fullscreen automatically
    if (latestViolation === "exit-fullscreen") {
      try {
        if (window.electronAPI?.setFullScreen) {
          await window.electronAPI.setFullScreen();
        }
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        }
      } catch (e) {
        console.warn("Could not re-enter fullscreen:", e);
      }
    }
    onDismiss();
  }

  return (
    <div className="violation-overlay">
      <div className="violation-modal">
        <div className="violation-icon">{isFinalWarning ? "🛑" : "⚠️"}</div>

        <h2 className="violation-title">
          {isFinalWarning
            ? "Maximum Violations Exceeded"
            : `Warning ${violationCount} of ${maxViolations}`}
        </h2>

        <p className="violation-message">{getDescription(latestViolation)}</p>

        <p className="violation-detail">
          {isFinalWarning
            ? "Your exam will now be automatically locked and submitted."
            : `Exam will automatically submit after ${maxViolations} violations.`}
        </p>

        {!isFinalWarning && (
          <button className="btn btn-dark" onClick={handleDismiss}>
            {latestViolation === "exit-fullscreen"
              ? "Re-enter Full Screen & Resume"
              : "I Understand & Resume"}
          </button>
        )}
      </div>
    </div>
  );
}

export default ViolationWarning;
