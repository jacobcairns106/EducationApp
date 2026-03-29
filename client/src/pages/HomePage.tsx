import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);

  function joinSession() {
    setError(null);
    const c = code.trim().toUpperCase();
    if (!c) {
      setError("Please enter a session code.");
      return;
    }
    navigate(`/join?code=${encodeURIComponent(c)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") joinSession();
  }

  return (
    <div className="home-page">
      <h1 className="home-title">Welcome to JC Quizzes</h1>
      <p className="home-subtitle">Real-time quizzes</p>

      <div className="home-cards">
        <div className="home-card">
          <h2>Lecturer</h2>
          <p className="home-card-desc">Create and manage quizzes, run live sessions</p>
          <div className="home-card-actions">
            <button className="home-btn home-btn-primary" onClick={() => navigate("/lecturer/login")}>
              Log In
            </button>
            <button className="home-btn home-btn-secondary" onClick={() => navigate("/lecturer/register")}>
              Create Account
            </button>
          </div>
        </div>

        <div className="home-divider">
          <span>or</span>
        </div>

        <div className="home-card">
          <h2>Student</h2>
          <p className="home-card-desc">Join a live session with your code</p>
          <input
            className="home-code-input"
            type="text"
            placeholder="Session code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            inputMode="text"
            autoCapitalize="characters"
          />
          <input
            className="home-nickname-input"
            type="text"
            placeholder="Nickname (optional)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="home-btn home-btn-primary" onClick={joinSession}>
            Join Session
          </button>
          {error && <p className="home-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
