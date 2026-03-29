
export type QuizSummary = {
  id: string;
  title: string;
  createdAt: string;
  questionCount?: number;
  mcqCount?: number;
  textCount?: number;
};

export type ResultsMode = "LIVE_AND_POST" | "POST_ONLY";

type QuestionType = "MCQ" | "TEXT";

export type CurrentQuestion = {
  id: string;
  prompt: string;
  options: string[];
  index: number;
  total: number;
  type: QuestionType;
  resultsMode: ResultsMode;
};

export type PreviousQuizStats = {
  quizTitle: string;
  questions: {
    prompt: string;
    index: number;
    type: QuestionType;
    totalResponses: number;
    correctCount: number;
    correctPercent: number;
    textResponses?: string[];
  }[];
};


export function getApiBase() {
  return (
    import.meta.env.VITE_API_URL ||
    (window.location.hostname === "localhost"
      ? "http://localhost:4000"
      : `http://${window.location.hostname}:4000`)
  );
}


export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("lecturerToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
