import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { type QuizSummary, getApiBase, authHeaders } from "../utils/lecturerUtils";
import "./QuizLibraryPage.css";

export default function QuizLibraryPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${getApiBase()}/api/quizzes`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`Failed to load quizzes (${res.status})`);
        const data = (await res.json()) as QuizSummary[];
        setQuizzes(data);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load quizzes");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${getApiBase()}/api/quizzes/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to delete quiz (${res.status})`);
      setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to delete quiz");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="quiz-library">
      <div className="quiz-library-topbar">
        <button className="quiz-library-back-btn" onClick={() => navigate(`/l/${code}`)}>
          &larr; Back to Session
        </button>
        <h1>Quiz Library</h1>
      </div>

      <div className="quiz-library-body">
        <button className="quiz-library-create-btn" onClick={() => navigate("/lecturer/quizzes/new")}>
          + Create New Quiz
        </button>

        {loading && <p className="quiz-library-status">Loading quizzes...</p>}
        {errorMsg && <p className="quiz-library-error">{errorMsg}</p>}

        {!loading && !errorMsg && quizzes.length === 0 && (
          <p className="quiz-library-status">No quizzes found. Create your first quiz!</p>
        )}

        <div className="quiz-library-grid">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="quiz-card">
              <div className="quiz-card-header">
                <h3 className="quiz-card-title">{quiz.title}</h3>
              </div>
              <div className="quiz-card-details">
                <span className="quiz-card-stat">
                  {quiz.questionCount ?? 0} question{quiz.questionCount !== 1 ? "s" : ""}
                </span>
                {quiz.createdAt && (
                  <span className="quiz-card-date">Created {formatDate(quiz.createdAt)}</span>
                )}
              </div>
              <div className="quiz-card-actions">
                <button className="quiz-card-edit-btn" onClick={() => navigate(`/lecturer/quizzes/${quiz.id}`)}>
                  Edit
                </button>
                <button className="quiz-card-delete-btn" onClick={() => setDeleteTarget(quiz)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <div className="quiz-delete-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="quiz-delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Quiz</h3>
            <p>Are you sure you want to delete <b>{deleteTarget.title}</b>?</p>
            <div className="quiz-delete-modal-actions">
              <button
                className="quiz-delete-modal-cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="quiz-delete-modal-confirm"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
