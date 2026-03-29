// These are the Unit tests for the auth helper functions (no database or server needed)
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth.js";

// Password hashing test 
describe("hashPassword", () => {
  it("returns a hash different from the input", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).not.toBe("mypassword");
    expect(hash.length).toBeGreaterThan(0);
  });
});

// Password verification test
describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("correct", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

// JWT signing and verification test
describe("signToken / verifyToken", () => {
  it("signToken returns a string", () => {
    const token = signToken({ id: "abc123", username: "testuser" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("verifyToken decodes a valid token", () => {
    const payload = { id: "abc123", username: "testuser" };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe("abc123");
    expect(decoded!.username).toBe("testuser");
  });

  it("verifyToken returns null for malformed token", () => {
    expect(verifyToken("not.a.valid.token")).toBeNull();
  });

  it("verifyToken returns null for tampered token", () => {
    const token = signToken({ id: "abc123", username: "testuser" });
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyToken(tampered)).toBeNull();
  });
});
