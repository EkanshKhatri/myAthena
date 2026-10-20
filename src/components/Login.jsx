import { useState } from "react";
import { loginStudent } from "../utils/api.js";

function Login({ onLogin }) {
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginStudent(studentId, name);

      if (data.success) {
        onLogin(data.token, data.studentName);
      } else {
        setError(data.message || "Login failed. Please try again.");
      }
    } catch (err) {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h2>Athena Exam Portal</h2>
        <p>Secure AI-Proctored Assessment Environment</p>

        <div className="login-input-group">
          <label htmlFor="studentId">Student ID</label>
          <input
            id="studentId"
            className="login-input"
            type="text"
            placeholder="Enter your Student ID"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
          />
        </div>

        <div className="login-input-group">
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            className="login-input"
            type="text"
            placeholder="Enter your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button className="btn btn-dark" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Start Exam"}
        </button>
      </form>
    </div>
  );
}

export default Login;
