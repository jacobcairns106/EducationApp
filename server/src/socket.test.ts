// These are the Integration tests for Socket.IO real-time events (join, quiz flow, responses)
// Uses socket.io-client to connect to the actual server on a random port.
import { io as clientIO, type Socket as ClientSocket } from "socket.io-client";
import { httpServer, io } from "./app.js";
import { cleanDatabase, createAuthenticatedLecturer, createTestSession, createTestQuiz } from "./test/helpers.js";
import type { AddressInfo } from "net";

let port: number;
let lecturerSocket: ClientSocket;
let studentSocket: ClientSocket;

function connectSocket(role: "student" | "lecturer" = "student"): ClientSocket {
  return clientIO(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${event}`)), timeoutMs);
    socket.once(event as any, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  const addr = httpServer.address();
  if (addr && typeof addr === "object") {
    port = addr.port;
  } else {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  }
});

afterAll(async () => {
  io.disconnectSockets(true);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterEach(() => {
  lecturerSocket?.disconnect();
  studentSocket?.disconnect();
});

// Joining a session test
describe("session:join", () => {
  it("student joins a valid session and receives session:joined", async () => {
    const session = await createTestSession("SOCK01");
    studentSocket = connectSocket();

    studentSocket.emit("session:join", { code: "SOCK01", name: "Alice", role: "student" });
    const payload = await waitFor<any>(studentSocket, "session:joined");

    expect(payload.code).toBe("SOCK01");
  });

  it("emits error for invalid session", async () => {
    studentSocket = connectSocket();

    studentSocket.emit("session:join", { code: "BADCODE", role: "student" });
    const payload = await waitFor<any>(studentSocket, "error");

    expect(payload.message).toContain("not found");
  });

  it("emits error for ended session", async () => {
    const session = await createTestSession("ENDED1");
    // End the session in the DB
    const { prisma } = await import("./prisma.js");
    await prisma.session.update({ where: { id: session.id }, data: { isEnded: true } });

    studentSocket = connectSocket();
    studentSocket.emit("session:join", { code: "ENDED1", role: "student" });
    const payload = await waitFor<any>(studentSocket, "error");

    expect(payload.message).toContain("not found or ended");
  });
});

// Starting a quiz test
describe("quiz:start", () => {
  it("broadcasts first question to all clients", async () => {
    const session = await createTestSession("QUIZ01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "QUIZ01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");

    studentSocket.emit("session:join", { code: "QUIZ01", name: "Bob", role: "student" });
    await waitFor(studentSocket, "session:joined");

    const studentQuestionPromise = waitFor<any>(studentSocket, "question:current");
    lecturerSocket.emit("quiz:start", { code: "QUIZ01", quizId: quiz.id });

    const question = await studentQuestionPromise;
    expect(question.prompt).toBe("What is 2+2?");
    expect(question.index).toBe(0);
    expect(question.total).toBe(2);
    expect(question.type).toBe("MCQ");
    expect(question.options).toEqual(["3", "4", "5", "6"]);
  });
});

// Submitting responses test
describe("response:submit", () => {
  it("MCQ answer triggers results:update broadcast", async () => {
    const session = await createTestSession("RESP01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "RESP01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "RESP01", name: "Carol", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "RESP01", quizId: quiz.id });
    const question = await waitFor<any>(lecturerSocket, "question:current");
    await waitFor(lecturerSocket, "results:update");

    const resultsPromise = waitFor<any>(lecturerSocket, "results:update");
    studentSocket.emit("response:submit", {
      code: "RESP01",
      questionId: question.id,
      voterKey: "voter-1",
      intValue: 1,
    });

    const results = await resultsPromise;
    expect(results.questionId).toBe(question.id);
    expect(results.counts[1]).toBe(1);
    expect(results.answeredCount).toBe(1);
  });

  it("student can change answer (upsert)", async () => {
    const session = await createTestSession("RESP02");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "RESP02", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "RESP02", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "RESP02", quizId: quiz.id });
    const question = await waitFor<any>(lecturerSocket, "question:current");
    // Consume initial results:update from quiz:start
    await waitFor(lecturerSocket, "results:update");

    // First vote
    studentSocket.emit("response:submit", {
      code: "RESP02", questionId: question.id, voterKey: "voter-1", intValue: 0,
    });
    await waitFor(lecturerSocket, "results:update");

    // Change vote
    const resultsPromise = waitFor<any>(lecturerSocket, "results:update");
    studentSocket.emit("response:submit", {
      code: "RESP02", questionId: question.id, voterKey: "voter-1", intValue: 2,
    });

    const results = await resultsPromise;
    expect(results.counts[0]).toBe(0); // old vote removed
    expect(results.counts[2]).toBe(1); // new vote
    expect(results.answeredCount).toBe(1); // still just 1 respondent
  });
});

// Ending a question test
describe("question:end", () => {
  it("locks question and broadcasts correct answer", async () => {
    const session = await createTestSession("QEND01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "QEND01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "QEND01", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "QEND01", quizId: quiz.id });
    const question = await waitFor<any>(studentSocket, "question:current");

    const endedPromise = waitFor<any>(studentSocket, "question:ended");
    lecturerSocket.emit("question:end", { code: "QEND01" });

    const ended = await endedPromise;
    expect(ended.questionId).toBe(question.id);
    expect(ended.correctOptionIndex).toBe(1); 
  });

  it("rejects response after question is ended", async () => {
    const session = await createTestSession("QEND02");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "QEND02", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "QEND02", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "QEND02", quizId: quiz.id });
    const question = await waitFor<any>(lecturerSocket, "question:current");

    lecturerSocket.emit("question:end", { code: "QEND02" });
    await waitFor(lecturerSocket, "question:ended");

    studentSocket.emit("response:submit", {
      code: "QEND02", questionId: question.id, voterKey: "late-voter", intValue: 0,
    });

    const gotUpdate = await Promise.race([
      waitFor(lecturerSocket, "results:update").then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);

    expect(gotUpdate).toBe(false);
  });
});

//  Lecturer advancing question test
describe("quiz:next", () => {
  it("advances to the next question", async () => {
    const session = await createTestSession("NEXT01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "NEXT01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "NEXT01", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "NEXT01", quizId: quiz.id });
    await waitFor(studentSocket, "question:current"); // Q1

    // End Q1 then advance
    lecturerSocket.emit("question:end", { code: "NEXT01" });
    await waitFor(studentSocket, "question:ended");

    const nextPromise = waitFor<any>(studentSocket, "question:current");
    lecturerSocket.emit("quiz:next", { code: "NEXT01" });

    const q2 = await nextPromise;
    expect(q2.prompt).toBe("Explain gravity");
    expect(q2.index).toBe(1);
    expect(q2.type).toBe("TEXT");
  });
});

// Ending the quiz test
describe("quiz:end", () => {
  it("ends quiz and broadcasts quiz:ended", async () => {
    const session = await createTestSession("END01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "END01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "END01", role: "student" });
    await waitFor(studentSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "END01", quizId: quiz.id });
    await waitFor(studentSocket, "question:current");

    const endedPromise = waitFor<any>(studentSocket, "quiz:ended");
    lecturerSocket.emit("quiz:end", { code: "END01" });

    const ended = await endedPromise;
    expect(ended.code).toBe("END01");
  });
});

// Ending the session test
describe("session:end", () => {
  it("permanently ends session", async () => {
    const session = await createTestSession("SESS01");

    lecturerSocket = connectSocket();
    studentSocket = connectSocket();

    lecturerSocket.emit("session:join", { code: "SESS01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");
    studentSocket.emit("session:join", { code: "SESS01", role: "student" });
    await waitFor(studentSocket, "session:joined");

    const endedPromise = waitFor<any>(studentSocket, "session:ended");
    lecturerSocket.emit("session:end", { code: "SESS01" });

    const ended = await endedPromise;
    expect(ended.code).toBe("SESS01");

    const newSocket = connectSocket();
    newSocket.emit("session:join", { code: "SESS01", role: "student" });
    const error = await waitFor<any>(newSocket, "error");
    expect(error.message).toContain("not found or ended");
    newSocket.disconnect();
  });
});

// A student that joins late test
describe("late join", () => {
  it("student joining mid-quiz receives active question", async () => {
    const session = await createTestSession("LATE01");
    const { lecturer } = await createAuthenticatedLecturer();
    const quiz = await createTestQuiz(lecturer.id);

    lecturerSocket = connectSocket();
    lecturerSocket.emit("session:join", { code: "LATE01", role: "lecturer" });
    await waitFor(lecturerSocket, "session:joined");

    lecturerSocket.emit("quiz:start", { code: "LATE01", quizId: quiz.id });
    await waitFor(lecturerSocket, "question:current");

    studentSocket = connectSocket();
    const questionPromise = waitFor<any>(studentSocket, "question:current");
    studentSocket.emit("session:join", { code: "LATE01", name: "Late Larry", role: "student" });

    const question = await questionPromise;
    expect(question.prompt).toBe("What is 2+2?");
    expect(question.index).toBe(0);
  });
});
