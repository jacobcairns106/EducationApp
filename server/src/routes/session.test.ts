// Integration tests for session endpoints
import request from "supertest";
import { app } from "../app.js";
import { cleanDatabase } from "../test/helpers.js";

// Wipe DB before each test
beforeEach(async () => {
  await cleanDatabase();
});

// --- Create session ---
describe("POST /api/sessions", () => {
  // Creating a session should return a 6-character code and a session ID
  it("creates a session with a unique code", async () => {
    const res = await request(app).post("/api/sessions");

    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
    expect(res.body.code).toHaveLength(6);
    expect(res.body.sessionId).toBeDefined();
  });

  // Two sessions should get different codes (no collisions)
  it("returns different codes for multiple sessions", async () => {
    const res1 = await request(app).post("/api/sessions");
    const res2 = await request(app).post("/api/sessions");

    expect(res1.body.code).not.toBe(res2.body.code);
  });
});

// --- Previous quiz stats ---
describe("GET /api/sessions/:code/previous-quiz-stats", () => {
  // A code that doesn't exist should return 404
  it("returns 404 for nonexistent session", async () => {
    const res = await request(app).get("/api/sessions/XXXXXX/previous-quiz-stats");

    expect(res.status).toBe(404);
  });

  // Session exists but no quiz has been run yet — no stats to return
  it("returns 404 when no quiz has been run", async () => {
    const session = await request(app).post("/api/sessions");

    const res = await request(app).get(`/api/sessions/${session.body.code}/previous-quiz-stats`);

    expect(res.status).toBe(404);
  });
});
