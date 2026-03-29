import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { QRCodeCanvas } from "qrcode.react";
import { type QuizSummary, type PreviousQuizStats, type ResultsMode, getApiBase, authHeaders } from "../utils/lecturerUtils";
import "./LecturerSetupPage.css";

export default function LecturerSetupPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState(0);

  // Quiz selection state — loaded from REST API, not from socket
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>("");
  const [resultsMode, setResultsMode] = useState<ResultsMode>("LIVE_AND_POST");

  // Stats from the previous quiz run in this session (if any)
  const [prevStats, setPrevStats] = useState<PreviousQuizStats | null>(null);

  const [copied, setCopied] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const [textResponsesModal, setTextResponsesModal] = useState<{ index: number; prompt: string; responses: string[] } | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Build the student join URL for QR code generation.
  // In dev mode, uses the LAN IP so students on the same network can scan the QR from their phones.
  const joinUrl = useMemo(() => {
    const DEV_ORIGIN = "http://192.168.1.115:5173";
    const origin = import.meta.env.DEV ? DEV_ORIGIN : window.location.origin;
    return `${origin}/join?code=${encodeURIComponent(code)}`;
  }, [code]);

  // Join session + listen for participant count
  useEffect(() => {
    if (!code) return;

    setErrorMsg(null);
    setStatusMsg(null);

    socket.emit("session:join", { code, role: "lecturer" });

    const onParticipants = (payload: any) => {
      if (payload.code === code) {
        const studentsOnly = Math.max(0, Number(payload.count ?? 0) - 1);
        setParticipants(studentsOnly);
      }
    };

    // If a question:current event arrives while on the setup page, it means
    // the quiz has started (possibly from another tab) — redirect to the live view
    const onQuestionCurrent = () => {
      navigate(`/l/${code}/live`);
    };

    const onSessionEnded = () => {
      navigate("/create");
    };

    const onError = (e: any) => {
      setErrorMsg(e?.message ?? "Unknown socket error");
    };

    socket.on("session:participants", onParticipants);
    socket.on("question:current", onQuestionCurrent);
    socket.on("session:ended", onSessionEnded);
    socket.on("error", onError);

    return () => {
      socket.off("session:participants", onParticipants);
      socket.off("question:current", onQuestionCurrent);
      socket.off("session:ended", onSessionEnded);
      socket.off("error", onError);
    };
  }, [code, navigate]);

  // Load quizzes from REST API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${getApiBase()}/api/quizzes`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`Failed to load quizzes (${res.status})`);
        const data = (await res.json()) as QuizSummary[];
        setQuizzes(data);
        if (data.length > 0) setSelectedQuizId(data[0].id);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load quizzes");
      }
    }

    load();
  }, []);

  // Load previous quiz stats
  useEffect(() => {
    if (!code) return;
    async function loadStats() {
      try {
        const res = await fetch(`${getApiBase()}/api/sessions/${code}/previous-quiz-stats`);
        if (!res.ok) return; // 404 = no previous quiz yet — leave null
        setPrevStats(await res.json());
      } catch {
        // network error — non-critical, leave null
      }
    }
    loadStats();
  }, [code]);

  function endSession() {
    socket.emit("session:end", { code });
  }

  // Emits quiz:start with the selected quiz and results mode.
  // The actual navigation to the live page is triggered by the question:current listener,
  // not directly here — this keeps multi-tab scenarios consistent.
  function startQuiz() {
    setErrorMsg(null);
    setStatusMsg(null);

    if (!selectedQuizId) {
      setErrorMsg("Please select a quiz first.");
      return;
    }

    socket.emit("quiz:start", { code, quizId: selectedQuizId, resultsMode });
    setStatusMsg("Starting quiz…");
  }

  return (
    <div className="lecturer-setup">
      {/* Top bar */}
      <div className="setup-topbar">
        <span className="session-label">JC Quizzes</span>
        <div className="setup-topbar-right">
          <span className="participant-count">
            Students Connected: <b>{participants}</b>
          </span>
          <button className="setup-logout-btn" onClick={() => {
            localStorage.removeItem("lecturerToken");
            navigate("/");
          }}>
            Log Out
          </button>
        </div>
      </div>

      <div className="setup-body">
        {/* Left column: controls + dashboard */}
        <div className="setup-col-left">
          <div className="setup-controls-card">
            <h2>Quiz Controls</h2>

            <label>
              Select quiz
              <select
                value={selectedQuizId}
                onChange={(e) => setSelectedQuizId(e.target.value)}
              >
                {quizzes.length === 0 && <option value="">(No quizzes found)</option>}
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Response Display Settings
              <select
                value={resultsMode}
                onChange={(e) => setResultsMode(e.target.value as ResultsMode)}
              >
                <option value="LIVE_AND_POST">During &amp; after question</option>
                <option value="POST_ONLY">After question only</option>
              </select>
            </label>

            {statusMsg && <p className="setup-status-msg">{statusMsg}</p>}
            {errorMsg && <p className="setup-error-msg">{errorMsg}</p>}
          </div>

          <div className="setup-dashboard-card">
            <h2>Session Dashboard</h2>
            <div className="dashboard-grid">
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Selected Quiz</span>
                <span className="dashboard-stat-value">
                  {quizzes.find((q) => q.id === selectedQuizId)?.title ?? "Not selected"}
                </span>
              </div>
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Status</span>
                <span className="dashboard-stat-value">
                  {quizzes.length > 0 ? "Ready to start" : "Create quiz"}
                </span>
              </div>
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Students Connected</span>
                <span className="dashboard-stat-value">{participants}</span>
              </div>
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Questions Quantity</span>
                <span className="dashboard-stat-value">
                  {quizzes.find((q) => q.id === selectedQuizId)?.questionCount ?? "—"}
                </span>
              </div>
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Question Types</span>
                <span className="dashboard-stat-value">
                  {(() => {
                    const quiz = quizzes.find((q) => q.id === selectedQuizId);
                    if (!quiz) return "—";
                    const mcq = quiz.mcqCount ?? 0;
                    const text = quiz.textCount ?? 0;
                    if (mcq === 0 && text === 0) return "No questions";
                    if (text === 0) return <><span className="type-accent-mcq">MCQ ({mcq})</span></>;
                    if (mcq === 0) return <><span className="type-accent-text">Text ({text})</span></>;
                    return <><span className="type-accent-mcq">MCQ ({mcq})</span>{" / "}<span className="type-accent-text">Text ({text})</span></>;
                  })()}
                </span>
              </div>
              <div className="dashboard-stat">
                <span className="dashboard-stat-label">Response Display Mode</span>
                <span className="dashboard-stat-value">
                  {resultsMode === "LIVE_AND_POST" ? "During & after question" : "After question only"}
                </span>
              </div>
            </div>

            <div className="dashboard-actions">
              <button className="setup-start-btn" onClick={startQuiz} disabled={!selectedQuizId}>
                Start quiz
              </button>
              <button className="setup-manage-btn" onClick={() => navigate(`/l/${code}/quizzes`)}>
                Manage Quizzes
              </button>
              <button className="setup-end-btn" onClick={endSession}>
                End session
              </button>
            </div>
          </div>
        </div>

        {/* Right column: QR + stats */}
        <div className="setup-col-right">
          <div className="setup-qr-card">
            <button className="setup-qr-expand-icon" onClick={() => setQrExpanded(true)} title="Expand QR">
              &#x2922;
            </button>
            <h2>Join via QR</h2>
            <QRCodeCanvas value={joinUrl} size={200} />
            <p className="setup-session-code">Session code: <span>{code}</span></p>
            <button
              className="setup-copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(joinUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy join link"}
            </button>
          </div>

          <div className="setup-stats-card">
            <button className="setup-card-expand-icon" onClick={() => setStatsExpanded(true)} title="Expand stats">
              &#x2922;
            </button>
            <h2>Previous Quiz Stats</h2>
            {prevStats ? (
              <>
                <div className="stats-row">
                  <span className="stats-label">Quiz</span>
                  <span className="stats-value">{prevStats.quizTitle}</span>
                </div>
                <ul className="stats-question-list">
                  {prevStats.questions.map((q) => (
                    <li key={q.index} className="stats-question-item">
                      <span className={`stats-type-tag ${q.type === "TEXT" ? "tag-text" : "tag-mcq"}`}>
                        {q.type === "TEXT" ? "Text" : "MCQ"}
                      </span>
                      <span className="stats-question-prompt">Q{q.index + 1}. {q.prompt}</span>
                      {q.type === "TEXT" ? (
                        <button
                          className="stats-view-answers-btn"
                          onClick={() => setTextResponsesModal({ index: q.index, prompt: q.prompt, responses: q.textResponses ?? [] })}
                        >
                          View answers
                        </button>
                      ) : (
                        <span className="stats-question-percent">{q.correctPercent}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="stats-empty-hint">No previous quiz data available yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Overlays */}
      {qrExpanded && (
        <div className="qr-overlay" onClick={() => setQrExpanded(false)}>
          <div className="qr-overlay-content" onClick={(e) => e.stopPropagation()}>
            <button className="qr-overlay-close" onClick={() => setQrExpanded(false)}>
              &times;
            </button>
            <QRCodeCanvas value={joinUrl} size={360} />
            <p className="qr-overlay-code">Session code: <span>{code}</span></p>
            <button
              className="setup-copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(joinUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy join link"}
            </button>
          </div>
        </div>
      )}

      {statsExpanded && (
        <div className="qr-overlay" onClick={() => setStatsExpanded(false)}>
          <div className="qr-overlay-content stats-overlay-content" onClick={(e) => e.stopPropagation()}>
            <button className="qr-overlay-close" onClick={() => setStatsExpanded(false)}>
              &times;
            </button>
            <h2 className="stats-overlay-title">Previous Quiz Stats</h2>
            {prevStats ? (
              <>
                <div className="stats-row">
                  <span className="stats-label">Quiz</span>
                  <span className="stats-value">{prevStats.quizTitle}</span>
                </div>
                <ul className="stats-question-list">
                  {prevStats.questions.map((q) => (
                    <li key={q.index} className="stats-question-item">
                      <span className={`stats-type-tag ${q.type === "TEXT" ? "tag-text" : "tag-mcq"}`}>
                        {q.type === "TEXT" ? "Text" : "MCQ"}
                      </span>
                      <span className="stats-question-prompt">Q{q.index + 1}. {q.prompt}</span>
                      {q.type === "TEXT" ? (
                        <button
                          className="stats-view-answers-btn"
                          onClick={() => setTextResponsesModal({ index: q.index, prompt: q.prompt, responses: q.textResponses ?? [] })}
                        >
                          View answers
                        </button>
                      ) : (
                        <span className="stats-question-percent">{q.correctPercent}% Correct</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="stats-empty-hint">No previous quiz data available yet</p>
            )}
          </div>
        </div>
      )}

      {textResponsesModal && (
        <div className="qr-overlay" onClick={() => setTextResponsesModal(null)}>
          <div className="qr-overlay-content stats-overlay-content" onClick={(e) => e.stopPropagation()}>
            <button className="qr-overlay-close" onClick={() => setTextResponsesModal(null)}>
              &times;
            </button>
            <h2 className="stats-overlay-title">Q{textResponsesModal.index + 1}. {textResponsesModal.prompt}</h2>
            <p className="stats-responses-count">{textResponsesModal.responses.length} response{textResponsesModal.responses.length !== 1 ? "s" : ""}</p>
            {textResponsesModal.responses.length > 0 ? (
              <ul className="stats-responses-list">
                {textResponsesModal.responses.map((r, i) => (
                  <li key={i} className="stats-response-item">{r}</li>
                ))}
              </ul>
            ) : (
              <p className="stats-empty-hint">No responses submitted</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
