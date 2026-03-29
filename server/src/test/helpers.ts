import { prisma } from "../prisma.js";
import { hashPassword, signToken } from "../auth.js";
import type { Socket as ClientSocket } from "socket.io-client";

export async function cleanDatabase() {
  await prisma.response.deleteMany();
  await prisma.sessionQuestion.deleteMany();
  await prisma.session.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.lecturer.deleteMany();
}

// Creates a lecturer in the DB and returns a valid JWT
export async function createAuthenticatedLecturer(
  username = "testlecturer",
  password = "password123"
) {
  const lecturer = await prisma.lecturer.create({
    data: { username, passwordHash: await hashPassword(password) },
  });
  const token = signToken({ id: lecturer.id, username: lecturer.username });
  return { lecturer, token };
}

// Creates a session and returns it
export async function createTestSession(code = "TEST01") {
  return prisma.session.create({ data: { code } });
}

// Creates a quiz sample MCQ + TEXT questions
export async function createTestQuiz(lecturerId: string) {
  return prisma.quiz.create({
    data: {
      title: "Test Quiz",
      lecturerId,
      questions: {
        create: [
          { prompt: "What is 2+4", type: "MCQ", options: ["3", "4", "5", "6"], correct: 3, order: 0 },
          { prompt: "Where is Strathclyde University located?", type: "TEXT", options: [], correct: null, order: 1 },
        ],
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
}

// Promise wrapper for socket.io-client events
export function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), timeoutMs);
    socket.once(event as any, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
