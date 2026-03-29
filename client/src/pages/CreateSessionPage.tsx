import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession } from "../api";
import "./CreateSessionPage.css";

export default function CreateSessionPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  async function onCreate() {
    setLoading(true);
    setError(null);
    try {
      const data = await createSession();
      nav(`/l/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="create-session-page">
      <div className="create-session-card">
        <h1>Create Session</h1>
        <p className="create-session-desc">
          Start a new live session for your students to join.
        </p>
        <button className="create-session-btn" onClick={onCreate} disabled={loading}>
          {loading ? "Creating..." : "Create Session"}
        </button>
        {error && <p className="create-session-error">{error}</p>}
      </div>
    </div>
  );
}
