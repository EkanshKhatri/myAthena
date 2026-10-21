/**
 * Athena AI Face & Acoustic Proctoring Engine
 * Runs client-side real-time face detection, presence tracking, gaze estimation,
 * and background acoustic analysis.
 */

export class FaceAndAudioProctor {
  constructor({
    videoElement,
    mediaStream,
    onViolation,
    onAudioLevel,
    onStatus,
  }) {
    this.video = videoElement;
    this.stream = mediaStream;
    this.onViolation = onViolation;
    this.onAudioLevel = onAudioLevel;
    this.onStatus = onStatus;

    this.isRunning = false;
    this.analysisInterval = null;
    this.audioContext = null;
    this.analyser = null;
    this.audioInterval = null;

    // Consecutive violation counters to avoid spurious blips
    this.noFaceCount = 0;
    this.multiFaceCount = 0;
    this.gazeAwayCount = 0;
    this.loudNoiseCount = 0;

    // Offscreen canvas for vision analysis
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

    // Native FaceDetector support if available
    this.nativeDetector = null;
    if (typeof window.FaceDetector !== "undefined") {
      try {
        this.nativeDetector = new window.FaceDetector({
          fastMode: true,
          maxDetectedFaces: 4,
        });
      } catch (e) {
        this.nativeDetector = null;
      }
    }
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start vision checks every 1.2 seconds
    this.analysisInterval = setInterval(() => {
      this.analyzeVisualFrame();
    }, 1200);

    // Start audio monitoring
    await this.startAudioMonitoring();
  }

  stop() {
    this.isRunning = false;
    if (this.analysisInterval) clearInterval(this.analysisInterval);
    if (this.audioInterval) clearInterval(this.audioInterval);
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch {}
    }
  }

  async startAudioMonitoring() {
    try {
      if (!this.stream || this.stream.getAudioTracks().length === 0) {
        console.warn("No audio tracks in media stream");
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();

      // Ensure audio context is running (resume if suspended by browser)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);

      const bufferLength = this.analyser.fftSize;
      const timeData = new Uint8Array(bufferLength);

      this.audioInterval = setInterval(() => {
        if (!this.isRunning || !this.analyser) return;

        // Resume if somehow suspended
        if (this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }

        // Time-domain RMS volume calculation (standard accurate audio metering)
        this.analyser.getByteTimeDomainData(timeData);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // Normalize to a percentage level (0 - 100)
        const volume = Math.min(100, Math.round(rms * 280));

        if (this.onAudioLevel) {
          this.onAudioLevel(volume);
        }

        // Voice / speech detection threshold
        if (volume >= 22) {
          this.loudNoiseCount++;
          // Flag after 2 consecutive speech detections (~1.6 seconds)
          if (this.loudNoiseCount >= 2) {
            this.onViolation(
              "excessive-noise",
              `Acoustic speech / talking detected (Noise level: ${volume}%)`
            );
            this.loudNoiseCount = 0;
          }
        } else {
          this.loudNoiseCount = Math.max(0, this.loudNoiseCount - 1);
        }
      }, 800);
    } catch (err) {
      console.warn("Audio proctoring initialization error:", err);
    }
  }

  async analyzeVisualFrame() {
    if (!this.video || this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const frameData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const data = frameData.data;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const totalPixels = w * h;

    // ── 1. FACE DETECTION (Native Detector or CV Fallback) ──────
    if (this.nativeDetector) {
      try {
        const detectedFaces = await this.nativeDetector.detect(this.video);

        if (detectedFaces.length === 0) {
          this.noFaceCount++;
          if (this.noFaceCount >= 2) {
            this.onViolation("no-face", "No face detected in camera view");
            this.noFaceCount = 0;
          }
          if (this.onStatus) this.onStatus({ faceCount: 0 });
        } else if (detectedFaces.length > 1) {
          this.multiFaceCount++;
          if (this.multiFaceCount >= 2) {
            this.onViolation(
              "multiple-faces",
              `Multiple faces (${detectedFaces.length}) detected`
            );
            this.multiFaceCount = 0;
          }
          if (this.onStatus) this.onStatus({ faceCount: detectedFaces.length });
        } else {
          // Exactly 1 face
          this.noFaceCount = 0;
          this.multiFaceCount = 0;
          if (this.onStatus) this.onStatus({ faceCount: 1 });

          // Gaze alignment
          const face = detectedFaces[0].boundingBox;
          const videoWidth = this.video.videoWidth || 640;
          const faceCenterX = face.x + face.width / 2;
          const relativeX = faceCenterX / videoWidth;

          if (relativeX < 0.2 || relativeX > 0.8) {
            this.gazeAwayCount++;
            if (this.gazeAwayCount >= 3) {
              this.onViolation(
                "gaze-away",
                "Candidate looking away from screen"
              );
              this.gazeAwayCount = 0;
            }
          } else {
            this.gazeAwayCount = 0;
          }
        }
        return;
      } catch (e) {
        // Fallback to computer-vision below
      }
    }

    // ── 2. COMPUTER VISION FACE FALLBACK ────────────────────────
    let skinCount = 0;
    let leftSkin = 0;
    let centerSkin = 0;
    let rightSkin = 0;
    let totalLuminance = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;

      const isSkin =
        r > 60 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b &&
        r - Math.min(g, b) > 15 &&
        Math.abs(r - g) > 15;

      if (isSkin) {
        skinCount++;
        const pixelIndex = i / 4;
        const x = pixelIndex % w;
        if (x < w * 0.33) leftSkin++;
        else if (x < w * 0.66) centerSkin++;
        else rightSkin++;
      }
    }

    const avgLuminance = totalLuminance / totalPixels;
    const skinRatio = skinCount / totalPixels;

    // Check if camera is covered or dark
    if (avgLuminance < 15 || skinRatio < 0.015) {
      this.noFaceCount++;
      if (this.onStatus) this.onStatus({ faceCount: 0 });
      if (this.noFaceCount >= 3) {
        this.onViolation("no-face", "No candidate visible or camera obstructed");
        this.noFaceCount = 0;
      }
      return;
    }

    this.noFaceCount = 0;
    if (this.onStatus) this.onStatus({ faceCount: 1 });

    // Multiple subjects
    const leftRatio = leftSkin / (skinCount || 1);
    const rightRatio = rightSkin / (skinCount || 1);
    const centerRatio = centerSkin / (skinCount || 1);

    if (leftRatio > 0.38 && rightRatio > 0.38 && centerRatio < 0.24) {
      this.multiFaceCount++;
      if (this.onStatus) this.onStatus({ faceCount: 2 });
      if (this.multiFaceCount >= 3) {
        this.onViolation(
          "multiple-faces",
          "Multiple individuals detected in frame"
        );
        this.multiFaceCount = 0;
      }
      return;
    }

    this.multiFaceCount = 0;

    // Gaze / posture drift
    if ((leftRatio > 0.65 || rightRatio > 0.65) && centerRatio < 0.2) {
      this.gazeAwayCount++;
      if (this.gazeAwayCount >= 4) {
        this.onViolation("gaze-away", "Candidate facing away from display");
        this.gazeAwayCount = 0;
      }
    } else {
      this.gazeAwayCount = 0;
    }
  }
}
