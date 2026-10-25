import { useEffect } from "react";

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

  /* ── Keyboard Accessibility Navigation ── */
  useEffect(() => {
    function handleKeyDown(e) {
      // Do not trigger hotkeys if student is typing in an input
      if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "arrowright" || key === "n") {
        e.preventDefault();
        handleNext();
      } else if (key === "arrowleft" || key === "p") {
        e.preventDefault();
        handlePrevious();
      } else if (key === "m") {
        e.preventDefault();
        toggleMarkForReview();
      } else if (["1", "2", "3", "4"].includes(e.key) && currentQuestion) {
        const optionIdx = parseInt(e.key, 10) - 1;
        if (currentQuestion.type === "mcq" && currentQuestion.options?.[optionIdx] !== undefined) {
          e.preventDefault();
          handleMcqChange(optionIdx);
        } else if (currentQuestion.type === "true-false") {
          if (optionIdx === 0) handleTrueFalseChange(0);
          if (optionIdx === 1) handleTrueFalseChange(1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, questions.length, currentQuestion, answers, markedForReview]);

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
        return options.map((opt, idx) => (
          <label
            key={idx}
            className={`option-label ${
              currentAnswer === idx ? "option-selected" : ""
            }`}
          >
            <input
              type="radio"
              name={`q-${currentQuestion.id}`}
              checked={currentAnswer === idx}
              onChange={() => handleMcqChange(idx)}
            />
            <span className="opt-key-hint">{idx + 1}</span>
            <span>{opt}</span>
          </label>
        ));

      case "multi-select":
        return options.map((opt, idx) => {
          const selectedList = currentAnswer || [];
          const isChecked = selectedList.includes(idx);
          return (
            <label
              key={idx}
              className={`option-label ${isChecked ? "option-selected" : ""}`}
            >
              <input
                type="checkbox"
                name={`q-${currentQuestion.id}-${idx}`}
                checked={isChecked}
                onChange={() => handleMultiSelectChange(idx)}
              />
              <span>{opt}</span>
            </label>
          );
        });

      case "true-false":
        return ["True", "False"].map((opt, idx) => (
          <label
            key={idx}
            className={`option-label ${
              currentAnswer === idx ? "option-selected" : ""
            }`}
          >
            <input
              type="radio"
              name={`q-${currentQuestion.id}`}
              checked={currentAnswer === idx}
              onChange={() => handleTrueFalseChange(idx)}
            />
            <span className="opt-key-hint">{idx === 0 ? "1" : "2"}</span>
            <span>{opt}</span>
          </label>
        ));

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

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="shortcuts-bar">
        <span className="shortcut-tag"><kbd>←</kbd> / <kbd>P</kbd> Prev</span>
        <span className="shortcut-tag"><kbd>→</kbd> / <kbd>N</kbd> Next</span>
        <span className="shortcut-tag"><kbd>M</kbd> Mark</span>
        <span className="shortcut-tag"><kbd>1</kbd>–<kbd>4</kbd> Select</span>
      </div>

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
