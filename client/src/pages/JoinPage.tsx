import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./JoinPage.css";

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nav = useNavigate();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const c = searchParams.get("code");
    if (c) {
      setCode(c.toUpperCase());
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [searchParams]);

  function join() {
    setError(null);

    const c = code.trim().toUpperCase();
    if (!c) {
      setError("Please enter a session code.");
      return;
    }

    localStorage.setItem("displayName", name.trim());
    nav(`/s/${c}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") join();
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <h1>Join Session</h1>

        <input
          placeholder="Session code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode="text"
          autoCapitalize="characters"
        />
        <input
          ref={nameInputRef}
          placeholder="Nickname (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="join-btn" onClick={join}>Join</button>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  );
}
