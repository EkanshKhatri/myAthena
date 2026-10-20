function MainExam({
  questions,
  currentIndex,
  setCurrentIndex,
  answers,
  setAnswers,
  markedForReview,
  setMarkedForReview,
}) {
  const currentQuestion = questions[currentIndex];

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function clearResponse() {
    if (!currentQuestion) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[currentQuestion.id];
      return next;
    });
  }

  function toggleMarkForReview() {
    if (!currentQuestion) return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function handleMcqChange(optionIndex) {
    setAnswer(currentQuestion.id, optionIndex);
  }

  function handleMultiSelectChange(optionIndex) {
    const current = answers[currentQuestion.id] || [];
    const next = current.includes(optionIndex)
      ? current.filter((i) => i !== optionIndex)
      : [...current, optionIndex];
    setAnswer(currentQuestion.id, next);
  }

  function handleTrueFalseChange(value) {
    setAnswer(currentQuestion.id, value);
  }

  function handleFillBlankChange(e) {
    setAnswer(currentQuestion.id, e.target.value);
  }

  function getTypeBadge(type) {
    switch (type) {
      case "mcq":
        return <span className="question-type-badge badge-mcq">Single Choice MCQ</span>;
      case "multi-select":
        return (
          <span className="question-type-badge badge-multi-select">
            Multiple Select (Check all that apply)
          </span>
        );
      case "true-false":
        return <span className="question-type-badge badge-true-false">True / False</span>;
      case "fill-blank":
        return (
          <span className="question-type-badge badge-fill-blank">
            Fill in the Blank
          </span>
        );
      default:
        return null;
    }
  }

  function renderOptions() {
    if (!currentQuestion) return null;

    const { type, options } = currentQuestion;
    const currentAnswer = answers[currentQuestion.id];

    switch (type) {
      case "mcq":
        return (options || []).map((option, index) => (
          <label key={index} className="option-row">
            <input
              type="radio"
              name={`question-${currentQuestion.id}`}
              checked={currentAnswer === index}
              onChange={() => handleMcqChange(index)}
            />
            <span>{option}</span>
          </label>
        ));

      case "multi-select":
        return (options || []).map((option, index) => (
          <label key={index} className="option-row">
            <input
              type="checkbox"
              checked={(currentAnswer || []).includes(index)}
              onChange={() => handleMultiSelectChange(index)}
            />
            <span>{option}</span>
          </label>
        ));

      case "true-false":
        return (
          <>
            <label className="option-row">
              <input
                type="radio"
                name={`question-${currentQuestion.id}`}
                checked={currentAnswer === 0}
                onChange={() => handleTrueFalseChange(0)}
              />
              <span>True</span>
            </label>
            <label className="option-row">
              <input
                type="radio"
                name={`question-${currentQuestion.id}`}
                checked={currentAnswer === 1}
                onChange={() => handleTrueFalseChange(1)}
              />
              <span>False</span>
            </label>
          </>
        );

      case "fill-blank":
        return (
          <input
            type="text"
            className="fill-blank-input"
            placeholder="Type your exact answer here..."
            value={currentAnswer || ""}
            onChange={handleFillBlankChange}
          />
        );

      default:
        return <p>Unknown question format</p>;
    }
  }

  if (!currentQuestion) return null;

  return (
    <div className="question-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>
          Question {currentIndex + 1} of {questions.length}
        </h2>
        {getTypeBadge(currentQuestion.type)}
      </div>

      <p>{currentQuestion.question}</p>

      {/* Options */}
      <div className="options-container">{renderOptions()}</div>

      {/* Question Toolbar */}
      <div className="question-actions">
        <button
          className={`btn ${
            markedForReview.has(currentQuestion.id) ? "btn-orange" : "btn-outline"
          }`}
          onClick={toggleMarkForReview}
        >
          {markedForReview.has(currentQuestion.id)
            ? "★ Marked for Review"
            : "☆ Mark for Review"}
        </button>

        <button className="btn btn-outline" onClick={clearResponse}>
          Clear Response
        </button>
      </div>

      {/* Navigation */}
      <div className="navigation-buttons">
        <button onClick={handlePrevious} disabled={currentIndex === 0}>
          ← Previous
        </button>

        <button
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default MainExam;
