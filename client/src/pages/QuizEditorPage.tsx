import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getApiBase, authHeaders } from "../utils/lecturerUtils";
import "./QuizEditorPage.css";

type QuestionType = "MCQ" | "TEXT";

const DEFAULT_OPTIONS = ["", "", "", ""];

type QuestionDraft = {
  key: number;
  prompt: string;
  type: QuestionType;
  options: string[];
  correctOption: number;
};

let nextKey = 0;

function makeBlankQuestion(): QuestionDraft {
  return { key: nextKey++, prompt: "", type: "MCQ", options: [...DEFAULT_OPTIONS], correctOption: 0 };
}

export default function QuizEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) return;
    async function load() {
      try {
        const res = await fetch(`${getApiBase()}/api/quizzes/${id}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`Failed to load quiz (${res.status})`);
        const data = await res.json();
        setTitle(data.title);
        setQuestions(
          (data.questions as any[]).map((q) => ({
            key: nextKey++,
            prompt: q.prompt,
            type: q.type as QuestionType,
            options: q.options?.length ? q.options : [...DEFAULT_OPTIONS],
            correctOption: q.correct ?? 0,
          }))
        );
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, isNew]);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!title.trim()) errors.title = "Please enter a quiz title.";

    if (questions.length === 0) {
      errors.questions = "Please add at least one valid question before saving.";
    } else {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.prompt.trim())
          errors[`q-${q.key}-prompt`] = "Question prompt is required.";
        if (q.type === "MCQ") {
          const filled = q.options.filter((o) => o.trim()).length;
          if (filled < 4)
            errors[`q-${q.key}-options`] = "All 4 answer options must be filled in.";
          if (q.correctOption < 0 || q.correctOption >= q.options.length)
            errors[`q-${q.key}-correct`] = "Please select the correct answer.";
        }
      }
    }

    setFieldErrors(errors);
    const hasErrors = Object.keys(errors).length > 0;
    if (hasErrors) {
      setErrorMsg("Please fix the highlighted errors before saving.");
    }
    return !hasErrors;
  }


  async function saveQuiz() {
    setErrorMsg(null);
    setFieldErrors({});
    if (!validate()) return;

    const body = {
      title,
      questions: questions.map((q, i) => ({
        prompt: q.prompt,
        type: q.type,
        options: q.type === "MCQ" ? q.options : [],
        correct: q.type === "MCQ" ? q.correctOption : null,
        order: i,
      })),
    };

    setSaving(true);
    try {
      const url = isNew
        ? `${getApiBase()}/api/quizzes`
        : `${getApiBase()}/api/quizzes/${id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to save quiz (${res.status})`);
      navigate(-1);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to save quiz");
    } finally {
      setSaving(false);
    }
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, makeBlankQuestion()]);
  }

  function updateQuestion(key: number, updates: Partial<QuestionDraft>) {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, ...updates } : q))
    );
  }

  function deleteQuestion(key: number) {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
  }

  function updateOption(key: number, optionIdx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        const options = [...q.options];
        options[optionIdx] = value;
        return { ...q, options };
      })
    );
  }

  function moveQuestion(key: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.key === key);
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <div className="quiz-editor">
      <div className="quiz-editor-topbar">
        <button className="quiz-editor-back-btn" onClick={() => navigate(-1)}>
          &larr; Back to Library
        </button>
        <h1>{isNew ? "Create Quiz" : "Edit Quiz"}</h1>
      </div>

      <div className="quiz-editor-body">
        {loading && <p className="quiz-editor-status">Loading quiz...</p>}
        {errorMsg && <p className="quiz-editor-error">{errorMsg}</p>}

        {!loading && (
        <>
        <div className="quiz-editor-card">
          <label className="quiz-editor-label">
            Quiz Title
            <input
              className={`quiz-editor-input${fieldErrors.title ? " input-error" : ""}`}
              type="text"
              placeholder="Enter quiz title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>
        </div>

        <div className="quiz-editor-card">
          <div className="quiz-editor-questions-header">
            <h2>Questions ({questions.length})</h2>
            <button className="quiz-editor-add-btn" onClick={addQuestion}>
              + Add Question
            </button>
          </div>

          {fieldErrors.questions && (
            <span className="field-error">{fieldErrors.questions}</span>
          )}

          {questions.length === 0 ? (
            <p className="quiz-editor-empty-hint">
              No questions yet. Add your first question to get started.
            </p>
          ) : (
            <div className="quiz-editor-question-list">
              {questions.map((q, idx) => (
                <div key={q.key} className={`question-card${
                  fieldErrors[`q-${q.key}-prompt`] || fieldErrors[`q-${q.key}-options`] || fieldErrors[`q-${q.key}-correct`]
                    ? " question-card-error" : ""
                }`}>
                  <div className="question-card-top">
                    <span className="question-card-number">Q{idx + 1}</span>
                    <div className="question-card-controls">
                      <button
                        className="question-move-btn"
                        title="Move up"
                        disabled={idx === 0}
                        onClick={() => moveQuestion(q.key, -1)}
                      >
                        &#x25B2;
                      </button>
                      <button
                        className="question-move-btn"
                        title="Move down"
                        disabled={idx === questions.length - 1}
                        onClick={() => moveQuestion(q.key, 1)}
                      >
                        &#x25BC;
                      </button>
                      <button
                        className="question-delete-btn"
                        title="Delete question"
                        onClick={() => deleteQuestion(q.key)}
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  <input
                    className={`quiz-editor-input${fieldErrors[`q-${q.key}-prompt`] ? " input-error" : ""}`}
                    type="text"
                    placeholder="Enter question prompt..."
                    value={q.prompt}
                    onChange={(e) =>
                      updateQuestion(q.key, { prompt: e.target.value })
                    }
                  />
                  {fieldErrors[`q-${q.key}-prompt`] && (
                    <span className="field-error">{fieldErrors[`q-${q.key}-prompt`]}</span>
                  )}

                  <label className="question-type-label">
                    Type
                    <select
                      className="question-type-select"
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(q.key, {
                          type: e.target.value as QuestionType,
                        })
                      }
                    >
                      <option value="MCQ">Multiple Choice</option>
                      <option value="TEXT">Text</option>
                    </select>
                  </label>

                  {q.type === "MCQ" && (
                    <div className="mcq-options">
                      <span className="mcq-options-label">Options</span>
                      {q.options.map((opt, optIdx) => (
                        <label key={optIdx} className="mcq-option-row">
                          <input
                            type="radio"
                            name={`correct-${q.key}`}
                            className="mcq-option-radio"
                            checked={q.correctOption === optIdx}
                            onChange={() =>
                              updateQuestion(q.key, { correctOption: optIdx })
                            }
                            title="Mark as correct answer"
                          />
                          <input
                            className="quiz-editor-input mcq-option-input"
                            type="text"
                            placeholder={`Option ${optIdx + 1}`}
                            value={opt}
                            onChange={(e) =>
                              updateOption(q.key, optIdx, e.target.value)
                            }
                          />
                        </label>
                      ))}
                      {fieldErrors[`q-${q.key}-options`] && (
                        <span className="field-error">{fieldErrors[`q-${q.key}-options`]}</span>
                      )}
                      {fieldErrors[`q-${q.key}-correct`] && (
                        <span className="field-error">{fieldErrors[`q-${q.key}-correct`]}</span>
                      )}
                      <span className="mcq-options-hint">
                        Select button for correct question answer
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="quiz-editor-actions">
          <button className="quiz-editor-save-btn" onClick={saveQuiz} disabled={saving}>
            {saving ? "Saving..." : "Save Quiz"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
