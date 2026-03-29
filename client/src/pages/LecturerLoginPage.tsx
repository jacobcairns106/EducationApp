import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "../utils/lecturerUtils";
import PasswordInput from "../components/PasswordInput";
import "./LecturerAuthPages.css";

export default function LecturerLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");
      // Persist JWT so RequireLecturerAuth and authHeaders() can use it across pages
      localStorage.setItem("lecturerToken", data.token);
      navigate("/create");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Lecturer Log In</h1>

        <input
          className="auth-input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="username"
        />
        <PasswordInput
          className="auth-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="current-password"
        />

        <button className="auth-submit-btn" onClick={handleLogin} disabled={loading}>
          {loading ? "Logging in..." : "Log In"}
        </button>

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-links">
          <button className="auth-link" onClick={() => navigate("/lecturer/register")}>
            Don't have an account? Register
          </button>
          <button className="auth-link" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
