/**
 * Structured Proctoring Audit Logger & Timeline Recorder
 * Maintains an append-only in-memory event timeline with ISO timestamps,
 * session metadata, and exportable JSON audit payload for candidate assessment review.
 */

class AuditLogger {
  constructor() {
    this.events = [];
    this.sessionStartedAt = Date.now();
  }

  /**
   * Record a security or assessment event
   * @param {string} category - 'system_check' | 'violation' | 'capture' | 'exam'
   * @param {string} action - Event description (e.g. 'SCREEN_CAPTURE_SAVED', 'AUDIO_VIOLATION_TRIGGERED')
   * @param {Object} details - Additional contextual metadata
   */
  log(category, action, details = {}) {
    const entry = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      relativeSeconds: Math.floor((Date.now() - this.sessionStartedAt) / 1000),
      category,
      action,
      details,
    };

    this.events.push(entry);
    return entry;
  }

  /**
   * Retrieve full chronological timeline
   */
  getTimeline() {
    return [...this.events];
  }

  /**
   * Retrieve recorded security violations
   */
  getViolations() {
    return this.events.filter((e) => e.category === "violation");
  }

  /**
   * Export complete session audit summary
   */
  exportReport(studentName = "Candidate") {
    return {
      sessionMetadata: {
        candidate: studentName,
        startedAt: new Date(this.sessionStartedAt).toISOString(),
        completedAt: new Date().toISOString(),
        totalDurationSeconds: Math.floor((Date.now() - this.sessionStartedAt) / 1000),
        totalEvents: this.events.length,
        totalViolations: this.getViolations().length,
      },
      timeline: this.getTimeline(),
    };
  }

  clear() {
    this.events = [];
    this.sessionStartedAt = Date.now();
  }
}

export const auditLogger = new AuditLogger();
export default auditLogger;
