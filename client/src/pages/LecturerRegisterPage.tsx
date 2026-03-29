import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "../utils/lecturerUtils";
import PasswordInput from "../components/PasswordInput";
import "./LecturerAuthPages.css";

export default function LecturerRegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed.");
      localStorage.setItem("lecturerToken", data.token);
      navigate("/create");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRegister();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create Account</h1>

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
          autoComplete="new-password"
        />
        <PasswordInput
          className="auth-input"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="new-password"
        />

        <button className="auth-submit-btn" onClick={handleRegister} disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </button>

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-links">
          <button className="auth-link" onClick={() => navigate("/lecturer/login")}>
            Already have an account? Log in
          </button>
          <button className="auth-link" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
