// Integration tests for quiz CRUD endpoints
import request from "supertest";
import { app } from "../app.js";
import { cleanDatabase } from "../test/helpers.js";


let token: string;

// Helper: register a lecturer via the API and return their JWT token.
// Uses the real register endpoint so the lecturer exists in the same
// Prisma connection context as the route handlers.
async function registerAndGetToken(username = "testlecturer", password = "password123") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username, password });
  return res.body.token as string;
}

// Wipe DB and create a fresh lecturer before each test
beforeEach(async () => {
  await cleanDatabase();
  token = await registerAndGetToken();
});

// Sample quiz payload used across multiple tests — one MCQ and one TEXT question
const sampleQuiz = {
  title: "Math Quiz",
  questions: [
    { prompt: "What is 2+2?", type: "MCQ", options: ["3", "4", "5", "6"], correct: 1, order: 0 },
    { prompt: "Explain pi", type: "TEXT", options: [], correct: null, order: 1 },
  ],
};

// --- Create quiz ---
describe("POST /api/quizzes", () => {
  // Successfully create a quiz and check all fields come back correctly
  it("creates a quiz with questions (201)", async () => {
    const res = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleQuiz);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Math Quiz");
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions[0].prompt).toBe("What is 2+2?");
    expect(res.body.questions[1].type).toBe("TEXT");
  });

  // Empty title should be rejected
  it("returns 400 when title is missing", async () => {
    const res = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "", questions: [] });

    expect(res.status).toBe(400);
  });

  // No auth token — should be blocked by middleware
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/quizzes")
      .send(sampleQuiz);

    expect(res.status).toBe(401);
  });
});

// --- List quizzes ---
describe("GET /api/quizzes", () => {
  // Each lecturer should only see their own quizzes, not other lecturers'
  it("returns only the authenticated lecturer's quizzes", async () => {
    // Create a quiz for our lecturer
    await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleQuiz);

    // Create another lecturer with a quiz
    const otherToken = await registerAndGetToken("otherlecturer");
    await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ title: "Other Quiz", questions: [] });

    const res = await request(app)
      .get("/api/quizzes")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Math Quiz");
    expect(res.body[0].questionCount).toBe(2);
    expect(res.body[0].mcqCount).toBe(1);
    expect(res.body[0].textCount).toBe(1);
  });
});

// --- Get single quiz ---
describe("GET /api/quizzes/:id", () => {
  // Fetch a specific quiz and verify it includes its questions
  it("returns quiz with questions", async () => {
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleQuiz);

    const res = await request(app)
      .get(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Math Quiz");
    expect(res.body.questions).toHaveLength(2);
  });

  // A lecturer should not be able to see another lecturer's quiz
  it("returns 404 for another lecturer's quiz", async () => {
    const otherToken = await registerAndGetToken("otherlecturer");
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${otherToken}`)
      .send(sampleQuiz);

    const res = await request(app)
      .get(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// --- Update quiz ---
describe("PUT /api/quizzes/:id", () => {
  // Updating a quiz should replace the title and all questions
  it("updates quiz and replaces questions", async () => {
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleQuiz);

    const res = await request(app)
      .put(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Updated Quiz",
        questions: [
          { prompt: "New Q1", type: "MCQ", options: ["A", "B", "C", "D"], correct: 0, order: 0 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Quiz");
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].prompt).toBe("New Q1");
  });

  // A lecturer should not be able to update another lecturer's quiz
  it("returns 404 for another lecturer's quiz", async () => {
    const otherToken = await registerAndGetToken("otherlecturer");
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${otherToken}`)
      .send(sampleQuiz);

    const res = await request(app)
      .put(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Hacked", questions: [] });

    expect(res.status).toBe(404);
  });
});

// --- Delete quiz ---
describe("DELETE /api/quizzes/:id", () => {
  // Delete a quiz and verify it's actually gone with a follow-up GET
  it("deletes the quiz", async () => {
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${token}`)
      .send(sampleQuiz);

    const res = await request(app)
      .delete(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Verify it's gone
    const getRes = await request(app)
      .get(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(404);
  });

  // A lecturer should not be able to delete another lecturer's quiz
  it("returns 404 for another lecturer's quiz", async () => {
    const otherToken = await registerAndGetToken("otherlecturer");
    const created = await request(app)
      .post("/api/quizzes")
      .set("Authorization", `Bearer ${otherToken}`)
      .send(sampleQuiz);

    const res = await request(app)
      .delete(`/api/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
