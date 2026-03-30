// Single source of truth for all Socket.IO event types.
// Both client and server import from here to keep the contract in sync.
// If an event changes, update these types FIRST — the compiler will flag mismatches.

export type Role = "student" | "lecturer";

export type SessionJoinPayload = {
  code: string;
  name?: string;
  role: Role;
};

export type SessionJoinedPayload = {
  code: string;
};

export type SessionParticipantsPayload = {
  code: string;
  count: number;
};

// Controls when students see vote tallies:
// LIVE_AND_POST = results visible as votes come in; POST_ONLY = results hidden until question ends
export type ResultsMode = "LIVE_AND_POST" | "POST_ONLY";

export type QuizStartPayload = {
  code: string;
  quizId: string;
  resultsMode?: ResultsMode;
};

export type QuizNextPayload = {
  code: string;
};

export type QuizStopPayload = {
  code: string;
};

export type QuestionType = "MCQ" | "TEXT";

export type CurrentQuestionPayload = {
  id: string;
  prompt: string;
  options: string[];
  index: number;
  total: number;
  type: QuestionType;
  resultsMode: ResultsMode;
};

export type ResponseSubmitPayload = {
  code: string;
  questionId: string;
  voterKey: string;
  intValue?: number;
  textValue?: string;
};

export type ResultsUpdatePayload = {
  questionId: string;
  counts: number[];
  answeredCount: number;
  textResponses?: string[];
};

export type QuestionEndPayload = {
  code: string;
};

export type QuestionEndedPayload = {
  questionId: string;
  correctOptionIndex: number;
};

export type QuizEndedPayload = {
  code: string;
};

export type SessionEndPayload = {
  code: string;
};

export type SessionEndedPayload = {
  code: string;
};

export type ErrorPayload = {
  message: string;
};

// Events the client emits to the server (student + lecturer actions)
export interface ClientToServerEvents {
  "session:join": (payload: SessionJoinPayload) => void;
  "quiz:start": (payload: QuizStartPayload) => void;
  "quiz:next": (payload: QuizNextPayload) => void;
  "quiz:end": (payload: QuizStopPayload) => void;
  "response:submit": (payload: ResponseSubmitPayload) => void;
  "question:end": (payload: QuestionEndPayload) => void;
  "session:end": (payload: SessionEndPayload) => void;
}

// Events the server broadcasts to clients (state updates + lifecycle signals)
export interface ServerToClientEvents {
  "session:joined": (payload: SessionJoinedPayload) => void;
  "session:participants": (payload: SessionParticipantsPayload) => void;
  "question:current": (payload: CurrentQuestionPayload) => void;
  "results:update": (payload: ResultsUpdatePayload) => void;
  "question:ended": (payload: QuestionEndedPayload) => void;
  "quiz:ended": (payload: QuizEndedPayload) => void;
  "session:ended": (payload: SessionEndedPayload) => void;
  "error": (payload: ErrorPayload) => void;
}
