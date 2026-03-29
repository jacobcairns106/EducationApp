import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { type CurrentQuestion } from "../utils/lecturerUtils";
import "./LecturerLivePage.css";

export default function LecturerLivePage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState(0);
  const [currentQ, setCurrentQ] = useState<CurrentQuestion | null>(null);
  const [counts, setCounts] = useState<number[] | null>(null);       
  const [answeredCount, setAnsweredCount] = useState(0);              
  const [questionEnded, setQuestionEnded] = useState(false);          
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | null>(null); 
  const [textResponses, setTextResponses] = useState<string[]>([]); 
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    socket.emit("session:join", { code, role: "lecturer" });

    const onParticipants = (payload: any) => {
      if (payload.code === code) {
        const studentsOnly = Math.max(0, Number(payload.count ?? 0) - 1);
        setParticipants(studentsOnly);
      }
    };

    const onQuestionCurrent = (payload: any) => {
      setCurrentQ({
        id: payload.id,
        prompt: payload.prompt,
        options: payload.options ?? [],
        index: payload.index ?? 0,
        total: payload.total ?? 0,
        type: payload.type ?? "MCQ",
        resultsMode: payload.resultsMode ?? "LIVE_AND_POST",
      });
      setCounts(null);
      setAnsweredCount(0);
      setTextResponses([]);
      setQuestionEnded(false);
      setCorrectOptionIndex(null);
    };

    const onQuestionEnded = (payload: any) => {
      console.log("[LecturerLive] question:ended payload", payload);
      setQuestionEnded(true);
      setCorrectOptionIndex(payload.correctOptionIndex ?? null);
    };

    const onResultsUpdate = (payload: any) => {
      setCounts(payload.counts ?? null);
      setAnsweredCount(payload.answeredCount ?? 0);
      if (payload.textResponses) setTextResponses(payload.textResponses);
    };

    const onQuizEnded = () => {
      navigate(`/l/${code}`);
    };

    const onError = (e: any) => {
      setErrorMsg(e?.message ?? "Unknown socket error");
    };

    socket.on("session:participants", onParticipants);
    socket.on("question:current", onQuestionCurrent);
    socket.on("question:ended", onQuestionEnded);
    socket.on("results:update", onResultsUpdate);
    socket.on("quiz:ended", onQuizEnded);
    socket.on("error", onError);

    return () => {
      socket.off("session:participants", onParticipants);
      socket.off("question:current", onQuestionCurrent);
      socket.off("question:ended", onQuestionEnded);
      socket.off("results:update", onResultsUpdate);
      socket.off("quiz:ended", onQuizEnded);
      socket.off("error", onError);
    };
  }, [code, navigate]);

  function endQuestion() {
    socket.emit("question:end", { code });
  }

  function nextQuestion() {
    setErrorMsg(null);
    socket.emit("quiz:next", { code });
  }

  function endQuiz() {
    socket.emit("quiz:end", { code });
  }

  return (
    <div className="lecturer-live">
      {/* Top bar */}
      <div className="lecturer-topbar">
        <span className="session-label">JC Quizzes</span>
        <span className="participant-count">
          Students Connected: <b>{participants}</b>
        </span>
      </div>

      {errorMsg && <p className="lecturer-error">{errorMsg}</p>}

      {!currentQ ? (
        <div className="lecturer-waiting">
          <p>Waiting for the first question...</p>
        </div>
      ) : (
        <div className="lecturer-content">
          <div className="lecturer-question-card">
            <div className="lecturer-question-header">
              <div className="lecturer-question-number">Question {currentQ.index + 1}</div>
              <p className="lecturer-question-text">{currentQ.prompt}</p>
            </div>

            <div className="lecturer-progress-wrapper">
              <div className="lecturer-progress-track">
                <div
                  className="lecturer-progress-fill"
                  style={{
                    width: `${participants > 0 ? (answeredCount / participants) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="lecturer-progress-label">
                {answeredCount} / {participants} responses
              </span>
            </div>

            {currentQ.type === "TEXT" ? (
              <div className="lecturer-text-card">
                <h3 className="lecturer-text-card-header">Student Responses</h3>
                {currentQ.resultsMode === "POST_ONLY" && !questionEnded ? (
                  <p className="lecturer-votes-waiting">Responses will be revealed after the question ends</p>
                ) : textResponses.length > 0 ? (
                  <div className="lecturer-text-responses">
                    {textResponses.map((text, i) => (
                      <div key={i} className="lecturer-text-row">{text}</div>
                    ))}
                  </div>
                ) : (
                  <p className="lecturer-votes-waiting">Waiting for responses...</p>
                )}
              </div>
            ) : currentQ.resultsMode === "POST_ONLY" && !questionEnded ? (
              currentQ.options.length === 4 ? (
                <div className="lecturer-option-grid">
                  {currentQ.options.map((opt, i) => (
                    <div key={i} className={`lecturer-option-tile tile-${i % 6}`}>
                      <span className="lecturer-option-tile-text">{opt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lecturer-option-list">
                  {currentQ.options.map((opt, i) => (
                    <div key={i} className={`lecturer-option-tile tile-${i % 6}`}>
                      <span className="lecturer-option-tile-text">{opt}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="lecturer-results-card">
                <h3 className="lecturer-results-card-header">Live Results</h3>
                {counts ? (
                  <div className="lecturer-bar-chart">
                    {currentQ.options.map((opt, i) => {
                      const maxCount = Math.max(...(counts ?? []), 1);
                      const pct = (counts[i] ?? 0) / maxCount;
                      const isCorrect = questionEnded && correctOptionIndex === i;
                      return (
                        <div key={i} className={`lecturer-bar-column${isCorrect ? " correct" : ""}`}>
                          <span className="lecturer-bar-count">{counts[i] ?? 0}</span>
                          <div className="lecturer-bar-area">
                            <div
                              className={`lecturer-bar bar-${i % 6}`}
                              style={{ height: `${Math.max(pct * 100, 4)}%` }}
                            />
                          </div>
                          <span className="lecturer-bar-label">
                            {opt}
                            {isCorrect && (
                              <span className="correct-mark"> &#10003; Correct</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="lecturer-votes-waiting">Waiting for votes...</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="lecturer-controls">
        {currentQ && !questionEnded && (
          <button className="btn-end-question" onClick={endQuestion}>
            End question
          </button>
        )}
        {currentQ && questionEnded && currentQ.index + 1 < currentQ.total && (
          <button className="btn-next-question" onClick={nextQuestion}>
            Next question
          </button>
        )}
        <button className="btn-end-quiz" onClick={endQuiz}>
          End quiz
        </button>
      </div>
    </div>
  );
}
