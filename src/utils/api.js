import questionBank from "../data/questions.js";

// In-memory local session store
const localSessions = new Map();

/**
 * Local Authentication
 */
export async function loginStudent(studentId, name) {
  if (!studentId || !name) {
    return { success: false, error: "Please enter both Student ID and Name." };
  }

  const token = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  localSessions.set(token, {
    studentId,
    name,
    startTime: Date.now(),
    violations: [],
    submitted: false,
  });

  return {
    success: true,
    token,
    studentName: name,
  };
}

/**
 * Fetch Questions (Strips correct answers before serving to client)
 */
export async function fetchQuestions(token) {
  // Fisher-Yates shuffle copy
  const shuffled = [...questionBank];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Strip correctAnswer
  const sanitized = shuffled.map(({ correctAnswer, ...q }) => q);

  return {
    questions: sanitized,
    examDuration: 60 * 60 * 1000, // 1 hour
    totalQuestions: sanitized.length,
  };
}

/**
 * Submit and Auto-Grade Exam Locally
 */
export async function submitExam(token, answers = {}, timeSpent = 0) {
  let score = 0;
  const results = [];

  for (const q of questionBank) {
    const yourAnswer = answers[q.id];
    let isCorrect = false;

    if (yourAnswer !== undefined && yourAnswer !== null) {
      switch (q.type) {
        case "mcq":
        case "true-false":
          isCorrect = Number(yourAnswer) === Number(q.correctAnswer);
          break;

        case "multi-select":
          if (Array.isArray(yourAnswer) && Array.isArray(q.correctAnswer)) {
            const sortedUser = [...yourAnswer].map(Number).sort().join(",");
            const sortedKey = [...q.correctAnswer].map(Number).sort().join(",");
            isCorrect = sortedUser === sortedKey;
          }
          break;

        case "fill-blank":
          isCorrect =
            String(yourAnswer).trim().toLowerCase() ===
            String(q.correctAnswer).trim().toLowerCase();
          break;

        default:
          isCorrect = false;
      }
    }

    if (isCorrect) score++;

    results.push({
      id: q.id,
      question: q.question,
      type: q.type,
      options: q.options || [],
      yourAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
    });
  }

  const total = questionBank.length;
  const percentage = Math.round((score / total) * 100);

  const session = localSessions.get(token);
  if (session) {
    session.submitted = true;
    session.score = score;
    session.timeSpent = timeSpent;
  }

  return {
    score,
    total,
    percentage,
    results,
    timeSpent,
  };
}

/**
 * Log Proctoring Violations Locally
 */
export async function reportViolation(token, type) {
  const session = localSessions.get(token);
  if (session) {
    session.violations.push({ type, timestamp: Date.now() });
  }
  return { success: true };
}
