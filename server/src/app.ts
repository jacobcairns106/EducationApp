import express from "express";
import cors from "cors";
import { createServer } from "http";
import { prisma } from "./prisma.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth.js";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  QuizStartPayload,
} from "../../shared/socketTypes.js";

export const app = express();

// CORS: allow the production client origin (CLIENT_URL env var) plus local dev origins.
const ALLOWED_ORIGIN_REGEX = /^http:\/\/(localhost|192\.168\.1\.\d{1,3}):5173$/;
const CLIENT_URL = process.env.CLIENT_URL; // e.g. "https://your-client.up.railway.app"

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN_REGEX.test(origin)) return cb(null, true);
      if (CLIENT_URL && origin === CLIENT_URL) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

// ----------- REST endpoints -----------

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Generates a random session join code. Excludes ambiguous characters (0, O, 1, I)
// so codes are easy to read aloud and type on mobile.
function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ----------- Auth endpoints -----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };

    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await prisma.lecturer.findUnique({ where: { username: username.trim() } });
    if (existing) {
      return res.status(409).json({ error: "Username already taken." });
    }

    const lecturer = await prisma.lecturer.create({
      data: { username: username.trim(), passwordHash: await hashPassword(password) },
    });

    const token = signToken({ id: lecturer.id, username: lecturer.username });
    res.status(201).json({ token, lecturer: { id: lecturer.id, username: lecturer.username } });
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };

    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const lecturer = await prisma.lecturer.findUnique({ where: { username: username.trim() } });
    if (!lecturer || !(await verifyPassword(password, lecturer.passwordHash))) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = signToken({ id: lecturer.id, username: lecturer.username });
    res.json({ token, lecturer: { id: lecturer.id, username: lecturer.username } });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ----------- Session endpoints -----------

// Creates a new session with a unique join code (retries up to 5 times on collision)
app.post("/api/sessions", async (_req, res) => {
  try {
    let code = makeCode();

    for (let i = 0; i < 5; i++) {
      const exists = await prisma.session.findUnique({ where: { code } });
      if (!exists) break;
      code = makeCode();
    }

    const session = await prisma.session.create({
      data: { code },
    });

    res.json({ code: session.code, sessionId: session.id });
  } catch (err) {
    console.error("POST /api/sessions error:", err);
    res.status(500).json({ error: "Failed to create session. Please try again." });
  }
});

// ----------- Auth middleware -----------

// Extracts and verifies the JWT from the Authorization header.
// On success, attaches lecturerId to the request so downstream handlers
// can scope queries to the authenticated lecturer's data.
function requireLecturer(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
  (req as any).lecturerId = payload.id;
  next();
}

// ----------- Quiz endpoints (auth required) -----------

// Returns all quizzes owned by the authenticated lecturer, with question type counts
// for the dashboard summary (avoids sending full question bodies).
app.get("/api/quizzes", requireLecturer, async (req, res) => {
  const lecturerId = (req as any).lecturerId;
  const quizzes = await prisma.quiz.findMany({
    where: { lecturerId },
    select: {
      id: true, title: true, createdAt: true,
      questions: { select: { type: true } },
    },
    orderBy: { title: "asc" },
  });
  res.json(quizzes.map((q) => ({
    id: q.id, title: q.title, createdAt: q.createdAt,
    questionCount: q.questions.length,
    mcqCount: q.questions.filter((qq) => qq.type === "MCQ").length,
    textCount: q.questions.filter((qq) => qq.type === "TEXT").length,
  })));
});

// Returns a single quiz with all questions (ordered). Ownership check ensures
// lecturers can only access their own quizzes (returns 404 to avoid leaking existence).
app.get("/api/quizzes/:id", requireLecturer, async (req, res) => {
  const lecturerId = (req as any).lecturerId;
  const id = req.params.id as string;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz || quiz.lecturerId !== lecturerId) return res.status(404).json({ error: "Quiz not found" });
  res.json(quiz);
});

app.post("/api/quizzes", requireLecturer, async (req, res) => {
  try {
    const lecturerId = (req as any).lecturerId;
    const { title, questions } = req.body as {
      title: string;
      questions: { prompt: string; type: string; options: string[]; correct: number | null; order: number }[];
    };

    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        lecturerId,
        questions: {
          create: questions.map((q, i) => ({
            prompt: q.prompt,
            type: q.type as any,
            options: q.options,
            correct: q.correct,
            order: i,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    res.status(201).json(quiz);
  } catch (err) {
    console.error("POST /api/quizzes error:", err);
    res.status(500).json({ error: "Failed to create quiz." });
  }
});

app.put("/api/quizzes/:id", requireLecturer, async (req, res) => {
  const lecturerId = (req as any).lecturerId;
  const id = req.params.id as string;
  const { title, questions } = req.body as {
    title: string;
    questions: { prompt: string; type: string; options: string[]; correct: number | null; order: number }[];
  };

  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  const existing = await prisma.quiz.findUnique({ where: { id } });
  if (!existing || existing.lecturerId !== lecturerId) return res.status(404).json({ error: "Quiz not found" });

  // Transaction: delete all existing questions then recreate them.
  // This "replace-all" approach is simpler than diffing individual question changes
  // and keeps the order values consistent.
  const quiz = await prisma.$transaction(async (tx) => {
    await tx.quizQuestion.deleteMany({ where: { quizId: id } });

    return tx.quiz.update({
      where: { id },
      data: {
        title: title.trim(),
        questions: {
          create: questions.map((q, i) => ({
            prompt: q.prompt,
            type: q.type as any,
            options: q.options,
            correct: q.correct,
            order: i,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });
  });

  res.json(quiz);
});

app.delete("/api/quizzes/:id", requireLecturer, async (req, res) => {
  const lecturerId = (req as any).lecturerId;
  const id = req.params.id as string;
  const existing = await prisma.quiz.findUnique({ where: { id } });
  if (!existing || existing.lecturerId !== lecturerId) return res.status(404).json({ error: "Quiz not found" });

  await prisma.quiz.delete({ where: { id } });
  res.json({ ok: true });
});

// Returns aggregated stats for the last quiz run in a session (used on the setup page
// to show the lecturer how students performed on the previous quiz).
app.get("/api/sessions/:code/previous-quiz-stats", async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { code: req.params.code },
  });

  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.lastQuizTitle) return res.status(404).json({ error: "No quiz linked to this session" });

  const sessionQuestions = await prisma.sessionQuestion.findMany({
    where: { sessionId: session.id },
    orderBy: { index: "asc" },
    include: { responses: { select: { intValue: true, textValue: true } } },
  });

  if (sessionQuestions.length === 0) {
    return res.status(404).json({ error: "No questions found for this session" });
  }

  const questions = sessionQuestions.map((sq) => {
    const totalResponses = sq.responses.length;
    const correctCount =
      sq.correct != null
        ? sq.responses.filter((r) => r.intValue === sq.correct).length
        : 0;
    const correctPercent =
      totalResponses > 0 ? Math.round((correctCount / totalResponses) * 1000) / 10 : 0;

    const textResponses =
      sq.type === "TEXT"
        ? sq.responses.filter((r) => r.textValue != null).map((r) => r.textValue!)
        : undefined;

    return {
      prompt: sq.prompt,
      index: sq.index,
      type: sq.type,
      totalResponses,
      correctCount,
      correctPercent,
      textResponses,
    };
  });

  res.json({ quizTitle: session.lastQuizTitle, questions });
});

// ----------- Socket.IO setup -----------

export const httpServer = createServer(app);

export const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN_REGEX.test(origin)) return cb(null, true);
      if (CLIENT_URL && origin === CLIENT_URL) return cb(null, true);
      return cb(new Error("Socket.IO CORS blocked"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

type ResultsMode = "LIVE_AND_POST" | "POST_ONLY";

// A Runner tracks the in-memory state of an active quiz within a session.
// This is NOT persisted to the database — if the server restarts, running quizzes are lost.
// This is acceptable for the MVP since quiz sessions are short-lived.
type Runner = {
  sessionId: string;
  quizId: string;
  currentIndex: number; // 0-based question index within the quiz
  resultsMode: ResultsMode;
};

// Maps session code → active quiz runner. Only one quiz can run per session at a time.
const runners = new Map<string, Runner>();

async function loadQuizQuestions(quizId: string) {
  return prisma.quizQuestion.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
  });
}

// Aggregates MCQ votes into an array of counts, one per option (e.g. [3, 7, 1, 2]).
// Used to build the bar chart on the lecturer's live results view.
async function computeMcqCounts(questionId: string, optionsCount: number) {
  const grouped = await prisma.response.groupBy({
    by: ["intValue"],
    where: { questionId },
    _count: { intValue: true },
  });

  const counts = Array.from({ length: optionsCount }, () => 0);
  for (const g of grouped) {
    if (g.intValue === null) continue;
    if (g.intValue >= 0 && g.intValue < optionsCount) {
      counts[g.intValue] = g._count.intValue;
    }
  }
  return counts;
}

async function countRespondents(questionId: string): Promise<number> {
  return prisma.response.count({
    where: { questionId },
  });
}

// Core quiz-flow function: deactivates the previous question, activates the next one,
// and broadcasts it to all clients in the session room. If no more questions exist
// at qIndex, the quiz ends automatically.
async function activateAndBroadcastQuestion(sessionCode: string, sessionId: string, qIndex: number, resultsMode: ResultsMode = "LIVE_AND_POST") {
  // Deactivate any currently-active question
  await prisma.sessionQuestion.updateMany({
    where: { sessionId, isActive: true },
    data: { isActive: false },
  });

  // Find the session question at index
  const sq = await prisma.sessionQuestion.findFirst({
    where: { sessionId, index: qIndex },
  });

  // If no more questions, end quiz
  if (!sq) {
    io.to(sessionCode).emit("quiz:ended", { code: sessionCode });
    runners.delete(sessionCode);
    return;
  }

  // Activate it
  const active = await prisma.sessionQuestion.update({
    where: { id: sq.id },
    data: { isActive: true },
  });

  const total = await prisma.sessionQuestion.count({ where: { sessionId } });

  // Broadcast current question

  io.to(sessionCode).emit("question:current", {
    id: active.id,
    prompt: active.prompt,
    options: active.options,
    index: active.index,
    total,
    type: active.type,
    resultsMode,
  });

  // Broadcast current results (not zeros — real counts)
  const counts = await computeMcqCounts(active.id, active.options.length);
  const answeredCount = await countRespondents(active.id);
  io.to(sessionCode).emit("results:update", { questionId: active.id, counts, answeredCount });
}

// Broadcasts the current socket room size so both lecturer and students see live headcount.
// The client subtracts 1 to exclude the lecturer's own connection.
function emitParticipantCount(sessionCode: string) {
  const room = io.sockets.adapter.rooms.get(sessionCode);
  const count = room ? room.size : 0;
  io.to(sessionCode).emit("session:participants", { code: sessionCode, count });
}

io.on("connection", (socket) => {
  // Both students and lecturers call session:join to enter a session room.
  // Late joiners receive the currently active question + results so they can catch up.
  socket.on("session:join", async (payload: { code: string; name?: string; role: "student" | "lecturer" }) => {
    const sessionCode = payload.code.trim().toUpperCase();

    const session = await prisma.session.findUnique({ where: { code: sessionCode } });
    if (!session || session.isEnded) {
      socket.emit("error", { message: "Session not found or ended." });
      return;
    }

    socket.join(sessionCode);
    socket.data.sessionCode = sessionCode;

    socket.emit("session:joined", { code: sessionCode });

    // If a quiz is already running, send the active question + results to this joiner
    const activeQ = await prisma.sessionQuestion.findFirst({
      where: { sessionId: session.id, isActive: true },
    });
    if (activeQ) {
      const total = await prisma.sessionQuestion.count({ where: { sessionId: session.id } });
      const runner = runners.get(sessionCode);
      socket.emit("question:current", {
        id: activeQ.id,
        prompt: activeQ.prompt,
        options: activeQ.options,
        index: activeQ.index,
        total,
        type: activeQ.type,
        resultsMode: runner?.resultsMode ?? "LIVE_AND_POST",
      });

      const counts = await computeMcqCounts(activeQ.id, activeQ.options.length);
      const answeredCount = await countRespondents(activeQ.id);
      socket.emit("results:update", { questionId: activeQ.id, counts, answeredCount });
    }

    emitParticipantCount(sessionCode);
  });

  // Lecturer starts a quiz: clears previous data, copies quiz questions into
  // SessionQuestion rows (snapshot), and broadcasts the first question.
  socket.on("quiz:start", async (payload: QuizStartPayload) => {
    const sessionCode = payload.code.trim().toUpperCase();

    const session = await prisma.session.findUnique({ where: { code: sessionCode } });
    if (!session || session.isEnded) {
      socket.emit("error", { message: "Session not found or ended." });
      return;
    }

    // Fresh run: wipe previous session questions + responses so each quiz start is clean.
    // SessionQuestions are snapshots of QuizQuestions — this decouples live data from the quiz template.
    await prisma.response.deleteMany({ where: { sessionId: session.id } });
    await prisma.sessionQuestion.deleteMany({ where: { sessionId: session.id } });

    const quizQuestions = await loadQuizQuestions(payload.quizId);

    // Look up the quiz title and save it on the session for the stats endpoint
    const quiz = await prisma.quiz.findUnique({ where: { id: payload.quizId }, select: { title: true } });
    await prisma.session.update({
      where: { id: session.id },
      data: { lastQuizTitle: quiz?.title ?? "Untitled Quiz" },
    });
    if (quizQuestions.length === 0) {
      socket.emit("error", { message: "Quiz has no questions." });
      return;
    }

    // Create session question instances
    await prisma.sessionQuestion.createMany({
      data: quizQuestions.map((qq, idx) => ({
        sessionId: session.id,
        index: idx,
        prompt: qq.prompt,
        options: qq.options,
        correct: qq.correct,
        type: qq.type,
        isActive: false,
      })),
    });

    const resultsMode: ResultsMode = payload.resultsMode === "POST_ONLY" ? "POST_ONLY" : "LIVE_AND_POST";
    runners.set(sessionCode, { sessionId: session.id, quizId: payload.quizId, currentIndex: 0, resultsMode });

    await activateAndBroadcastQuestion(sessionCode, session.id, 0, resultsMode);
  });

  // Advances to the next question. If the index exceeds available questions,
  // activateAndBroadcastQuestion will emit quiz:ended automatically.
  socket.on("quiz:next", async (payload: { code: string }) => {
    const sessionCode = payload.code.trim().toUpperCase();
    const runner = runners.get(sessionCode);

    if (!runner) {
      socket.emit("error", { message: "No quiz running for this session." });
      return;
    }

    runner.currentIndex += 1;
    runners.set(sessionCode, runner);

    await activateAndBroadcastQuestion(sessionCode, runner.sessionId, runner.currentIndex, runner.resultsMode);
  });

  // Locks the current question (no more responses accepted) and reveals the correct answer.
  // In POST_ONLY mode, this is when students first see the results.
  socket.on("question:end", async (payload: { code: string }) => {
    const sessionCode = payload.code.trim().toUpperCase();
    const runner = runners.get(sessionCode);

    if (!runner) {
      socket.emit("error", { message: "No quiz running for this session." });
      return;
    }

    const activeQ = await prisma.sessionQuestion.findFirst({
      where: { sessionId: runner.sessionId, isActive: true },
    });

    if (!activeQ) {
      socket.emit("error", { message: "No active question to end." });
      return;
    }

    // Deactivate the question so no further responses are accepted
    await prisma.sessionQuestion.update({
      where: { id: activeQ.id },
      data: { isActive: false },
    });

    // correct answer is already on the session question (copied from quiz at creation)
    const correctOptionIndex = activeQ.correct ?? -1;


    // Send final results so POST_ONLY mode gets counts at reveal time
    const counts = activeQ.type === "MCQ" ? await computeMcqCounts(activeQ.id, activeQ.options.length) : [];
    const answeredCount = await countRespondents(activeQ.id);
    io.to(sessionCode).emit("results:update", { questionId: activeQ.id, counts, answeredCount });

    io.to(sessionCode).emit("question:ended", {
      questionId: activeQ.id,
      correctOptionIndex,
    });
  });

  socket.on("quiz:end", async (payload: { code: string }) => {
    const sessionCode = payload.code.trim().toUpperCase();
    const runner = runners.get(sessionCode);

    if (!runner) {
      socket.emit("error", { message: "No quiz running for this session." });
      return;
    }

    // Deactivate any active question
    await prisma.sessionQuestion.updateMany({
      where: { sessionId: runner.sessionId, isActive: true },
      data: { isActive: false },
    });

    io.to(sessionCode).emit("quiz:ended", { code: sessionCode });
    runners.delete(sessionCode);
  });

  // Permanently ends a session — cleans up any running quiz, marks the session as ended
  // in the database, and notifies all connected clients.
  socket.on("session:end", async (payload: { code: string }) => {
    const sessionCode = payload.code.trim().toUpperCase();

    const session = await prisma.session.findUnique({ where: { code: sessionCode } });
    if (!session || session.isEnded) {
      socket.emit("error", { message: "Session not found or already ended." });
      return;
    }

    // Clean up any running quiz
    const runner = runners.get(sessionCode);
    if (runner) {
      await prisma.sessionQuestion.updateMany({
        where: { sessionId: runner.sessionId, isActive: true },
        data: { isActive: false },
      });
      runners.delete(sessionCode);
    }

    // Mark session as ended in DB
    await prisma.session.update({
      where: { id: session.id },
      data: { isEnded: true },
    });

    io.to(sessionCode).emit("session:ended", { code: sessionCode });
  });

  // Handles a student submitting an answer. Uses upsert keyed on (questionId, voterKey)
  // so students can change their answer before the question is locked, but can't vote twice.
  socket.on(
    "response:submit",
    async (payload: { code: string; questionId: string; voterKey: string; intValue?: number; textValue?: string }) => {
      const sessionCode = payload.code.trim().toUpperCase();

      const session = await prisma.session.findUnique({ where: { code: sessionCode } });
      if (!session) return;

      const q = await prisma.sessionQuestion.findUnique({ where: { id: payload.questionId } });
      if (!q || !q.isActive) return;

      let intValue: number | null = null;
      let textValue: string | null = null;

      if (q.type === "MCQ") {
        if (payload.intValue === undefined || payload.intValue === null) return;
        intValue = payload.intValue;
      } else if (q.type === "TEXT") {
        const trimmed = (payload.textValue ?? "").trim();
        if (!trimmed) return;
        textValue = trimmed;
      }

      await prisma.response.upsert({
        where: { questionId_voterKey: { questionId: q.id, voterKey: payload.voterKey } },
        update: { intValue, textValue },
        create: {
          sessionId: session.id,
          questionId: q.id,
          voterKey: payload.voterKey,
          intValue,
          textValue,
        },
      });

      const counts = q.type === "MCQ" ? await computeMcqCounts(q.id, q.options.length) : [];
      const answeredCount = await countRespondents(q.id);

      let textResponses: string[] | undefined;
      if (q.type === "TEXT") {
        const rows = await prisma.response.findMany({
          where: { questionId: q.id, textValue: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { textValue: true },
        });
        textResponses = rows.map((r) => r.textValue!);
      }

      io.to(sessionCode).emit("results:update", { questionId: q.id, counts, answeredCount, textResponses });
    }
  );

  // When a client disconnects, update the participant count for their session room
  socket.on("disconnect", () => {
    const sessionCode = socket.data.sessionCode as string | undefined;
    if (sessionCode) emitParticipantCount(sessionCode);
  });
});
