function QuestionPalette({
  questions,
  currentIndex,
  answers,
  markedForReview,
  onJumpTo,
}) {
  function getItemClass(question, index) {
    const isAnswered = answers[question.id] !== undefined;
    const isMarked = markedForReview.has(question.id);
    const isCurrent = index === currentIndex;

    let cls = "palette-item";

    if (isCurrent) cls += " palette-item--current";

    if (isMarked && isAnswered) {
      cls += " palette-item--review-answered";
    } else if (isMarked) {
      cls += " palette-item--review";
    } else if (isAnswered) {
      cls += " palette-item--answered";
    } else {
      cls += " palette-item--unanswered";
    }

    return cls;
  }

  return (
    <div className="question-palette">
      <h4 className="palette-title">Question Palette</h4>

      <div className="palette-grid">
        {questions.map((question, index) => (
          <button
            key={question.id}
            className={getItemClass(question, index)}
            onClick={() => onJumpTo(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div className="palette-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: "#27ae60" }} />
          Answered
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: "#e67e22" }} />
          Marked for Review
        </div>
        <div className="legend-item">
          <span
            className="legend-dot"
            style={{
              background: "#e67e22",
              border: "2px solid #27ae60",
            }}
          />
          Answered &amp; Marked
        </div>
        <div className="legend-item">
          <span
            className="legend-dot"
            style={{ background: "#e0e0e0" }}
          />
          Unanswered
        </div>
        <div className="legend-item">
          <span
            className="legend-dot"
            style={{ background: "white", border: "2px solid #3498db" }}
          />
          Current
        </div>
      </div>
    </div>
  );
}

export default QuestionPalette;
