function ResultPage() {
  async function handleExit() {
    if (window.electronAPI?.quitApp) {
      await window.electronAPI.quitApp();
    } else {
      window.close();
    }
  }

  return (
    <div className="system-check-page">
      <div
        className="system-check-card"
        style={{
          maxWidth: 520,
          textAlign: "center",
          padding: "48px 36px",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#ecfdf5",
            color: "#10b981",
            fontSize: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            border: "2px solid #a7f3d0",
          }}
        >
          ✓
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
          Exam Submitted Successfully
        </h2>

        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
          Your responses and assessment data have been securely recorded. You may now safely exit or close this application.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handleExit}
            className="btn btn-dark"
            style={{ minWidth: 160 }}
          >
            Exit Application
          </button>

          {window.electronAPI?.openScreenshotsFolder && (
            <button
              onClick={() => window.electronAPI.openScreenshotsFolder()}
              className="btn btn-outline"
              style={{ minWidth: 150 }}
            >
              📁 Screen Captures
            </button>
          )}

          {window.electronAPI?.openCameraFolder && (
            <button
              onClick={() => window.electronAPI.openCameraFolder()}
              className="btn btn-outline"
              style={{ minWidth: 150 }}
            >
              📷 Camera Snapshots
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultPage;