// Integration tests for auth endpoints and health check
import request from "supertest";
import { app } from "../app.js";
import { cleanDatabase } from "../test/helpers.js";

// Wipe the database before each test so they don't interfere with each other
beforeEach(async () => {
  await cleanDatabase();
});

// --- Health check ---
describe("GET /health", () => {
  // Simple smoke test to confirm the server is alive
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// --- Registration ---
describe("POST /api/auth/register", () => {
  // Successful registration should return a JWT and the new lecturer
  it("creates a lecturer and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "newlecturer", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.lecturer.username).toBe("newlecturer");
  });

  // No username provided — should be rejected
  it("returns 400 when username is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "password123" });

    expect(res.status).toBe(400);
  });

  // Password too short — should be rejected
  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "testuser", password: "abc" });

    expect(res.status).toBe(400);
  });

  // Registering the same username twice — second attempt should fail
  it("returns 409 for duplicate username", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "duplicate", password: "password123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "duplicate", password: "password456" });

    expect(res.status).toBe(409);
  });
});

// --- Login ---
describe("POST /api/auth/login", () => {
  // Create a lecturer to log in with before each login test
  beforeEach(async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "loginuser", password: "password123" });
  });

  // Valid credentials should return a JWT
  it("returns a token on success", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "loginuser", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.lecturer.username).toBe("loginuser");
  });

  // Wrong password — should be rejected
  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "loginuser", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  // Username doesn't exist — should be rejected
  it("returns 401 for nonexistent user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "password123" });

    expect(res.status).toBe(401);
  });

  // Empty body — should be rejected
  it("returns 400 when fields are missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({});

    expect(res.status).toBe(400);
  });
});
