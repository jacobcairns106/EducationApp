import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../socket";
import type { QuestionType } from "../../../shared/socketTypes";
import "./StudentSessionPage.css";

type CurrentQuestion = {
  id: string;
  prompt: string;
  options: string[];
  index: number;
  type: QuestionType;
};

function makeVoterKey() {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  return `vk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateVoterKey() {
  const existing = localStorage.getItem("voterKey");
  if (existing) return existing;

  const key = makeVoterKey();
  localStorage.setItem("voterKey", key);
  return key;
}

export default function StudentSessionPage() {
  const { code = "" } = useParams();

  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  const [currentQ, setCurrentQ] = useState<CurrentQuestion | null>(null);
  const [counts, setCounts] = useState<number[] | null>(null);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [textSubmitted, setTextSubmitted] = useState(false);

  const [questionEnded, setQuestionEnded] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null);
  const [quizEnded, setQuizEnded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  const voterKey = useMemo(() => getOrCreateVoterKey(), []);
  const displayName = useMemo(() => localStorage.getItem("displayName") || "Student", []);

  useEffect(() => {
    const name = localStorage.getItem("displayName") ?? undefined;

    setStatus("connecting");
    setError(null);

    setCurrentQ(null);
    setCounts(null);
    setMyVote(null);
    setQuestionEnded(false);
    setCorrectOptionIndex(null);
    setQuizEnded(false);
    setTextAnswer("");
    setTextSubmitted(false);

    const onJoined = () => setStatus("joined");

    const onQuestionCurrent = (payload: any) => {
      setQuizEnded(false);
      setQuestionEnded(false);
      setCorrectOptionIndex(null);
      setCurrentQ({
        id: payload.id,
        prompt: payload.prompt,
        options: payload.options ?? [],
        index: payload.index ?? 0,
        type: payload.type ?? "MCQ",
      });
      setCounts(null);
      setMyVote(null);
      setTextAnswer("");
      setTextSubmitted(false);
    };

    const onResultsUpdate = (payload: any) => {
      setCounts((prev) => {
        if (currentQ && payload.questionId !== currentQ.id) return prev;
        return payload.counts ?? null;
      });
    };

    const onQuestionEnded = (payload: any) => {
      console.log("[StudentSession] question:ended payload", payload);
      setQuestionEnded(true);
      setCorrectOptionIndex(payload.correctOptionIndex ?? null);
    };

    const onQuizEnded = (_payload: any) => {
      setQuizEnded(true);
      setCurrentQ(null);
      setCounts(null);
      setMyVote(null);
    };

    const onSessionEnded = () => {
      setSessionEnded(true);
      setCurrentQ(null);
    };

    const onError = (e: any) => {
      setStatus("error");
      setError(e?.message ?? "Error joining session");
    };

    socket.on("session:joined", onJoined);
    socket.on("question:current", onQuestionCurrent);
    socket.on("question:ended", onQuestionEnded);
    socket.on("results:update", onResultsUpdate);
    socket.on("quiz:ended", onQuizEnded);
    socket.on("session:ended", onSessionEnded);
    socket.on("error", onError);

    socket.emit("session:join", { code, name, role: "student" });

    return () => {
      socket.off("session:joined", onJoined);
      socket.off("question:current", onQuestionCurrent);
      socket.off("question:ended", onQuestionEnded);
      socket.off("results:update", onResultsUpdate);
      socket.off("quiz:ended", onQuizEnded);
      socket.off("session:ended", onSessionEnded);
      socket.off("error", onError);
    };
  }, [code]);


  function vote(optionIndex: number) {
    if (!currentQ) return;

    setMyVote(optionIndex);

    socket.emit("response:submit", {
      code,
      questionId: currentQ.id,
      voterKey,
      intValue: optionIndex,
    });
  }

  function submitText() {
    if (!currentQ) return;
    const trimmed = textAnswer.trim();
    if (!trimmed) return;

    setTextSubmitted(true);

    socket.emit("response:submit", {
      code,
      questionId: currentQ.id,
      voterKey,
      textValue: trimmed,
    });
  }

  return (
    <div className="student-session">
      <div className="student-topbar">
        <span className="display-name">{displayName}</span>
      </div>

      {status === "error" && (
        <div className="student-center">
          <p className="error-text">{error}</p>
        </div>
      )}

      {status === "connecting" && (
        <div className="student-center">
          <div className="waiting-icon">&#x1F50C;</div>
          <p>Connecting to session...</p>
        </div>
      )}

      {status === "joined" && sessionEnded && (
        <div className="quiz-ended-card">
          <h2>Session Ended</h2>
          <p>The lecturer has ended this session. Thanks for participating!</p>
        </div>
      )}

      {status === "joined" && !sessionEnded && quizEnded && (
        <div className="quiz-ended-card">
          <div className="ended-icon">&#x1F3C1;</div>
          <h2>Quiz Complete!</h2>
          <p>Thanks for participating. Waiting for next quiz...</p>
        </div>
      )}

      {status === "joined" && !sessionEnded && !quizEnded && !currentQ && (
        <div className="student-center">
          <div className="waiting-icon">&#x23F3;</div>
          <p>Waiting for the lecturer to start the quiz...</p>
        </div>
      )}

      {status === "joined" && !sessionEnded && !quizEnded && currentQ && (
        <>
          <div className="question-prompt">
            <div className="question-number">Question {currentQ.index + 1}</div>
            <p className="question-text">{currentQ.prompt}</p>
          </div>

          {currentQ.type === "MCQ" && (
            <div className="answer-grid">
              {currentQ.options.map((opt, idx) => {
                const tileIdx = idx % 4;
                const isSelected = myVote === idx;
                const isCorrect = questionEnded && correctOptionIndex === idx;
                const isWrong = questionEnded && isSelected && !isCorrect;
                const isDimmed = myVote !== null && myVote !== idx && !isCorrect;

                return (
                  <button
                    key={idx}
                    className={`answer-tile tile-${tileIdx}${isSelected ? " selected" : ""}${isDimmed ? " dimmed" : ""}${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
                    onClick={() => vote(idx)}
                    disabled={questionEnded}
                  >
                    {isCorrect && <span className="tile-shape">✓</span>}
                    <span className="tile-text">{opt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {currentQ.type === "TEXT" && (
            <div className="text-answer-area">
              {textSubmitted ? (
                <div className="text-submitted-msg">Answer submitted!</div>
              ) : (
                <>
                  <textarea
                    className="text-answer-input"
                    placeholder="Type your answer…"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    disabled={questionEnded}
                    rows={3}
                  />
                  <button
                    className="text-submit-btn"
                    onClick={submitText}
                    disabled={questionEnded || !textAnswer.trim()}
                  >
                    Submit
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="student-footer">
        <span className="session-code">Session: {code}</span>
        <span
          className={`status-badge ${
            status === "joined" ? "connected" : status === "connecting" ? "connecting" : "error"
          }`}
        >
          {status === "joined" ? "Connected" : status === "connecting" ? "Connecting..." : "Error"}
        </span>
      </div>
    </div>
  );
}


