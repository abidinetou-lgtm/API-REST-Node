import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateToken, hashToken, signAccessToken, verifyAccessToken } from "../../src/lib/tokens.js";
import { testEnv } from "../test-env.js";

const userId = "0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70";

describe("generateToken", () => {
  it("creates long, unique, URL safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe("hashToken", () => {
  it("always gives the same SHA-256 hash for the same token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("access tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("contain the user id and role", () => {
    const token = signAccessToken({ id: userId, role: "AGENT" });

    expect(verifyAccessToken(token)).toBe(userId);
    expect(jwt.decode(token)).toMatchObject({ sub: userId, role: "AGENT" });
  });

  it("expire after 15 minutes", () => {
    vi.useFakeTimers();
    const token = signAccessToken({ id: userId, role: "USER" });

    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(verifyAccessToken(token)).toBe(userId);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("are refused when modified", () => {
    const [header, , signature] = signAccessToken({ id: userId, role: "USER" }).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: userId, role: "SUPER_ADMIN" })).toString("base64url");

    expect(verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("are refused when signed with another secret or without signature", () => {
    const otherSecret = jwt.sign({}, "another-secret-that-is-long-enough-too", { subject: userId });
    const unsigned = jwt.sign({}, "", { subject: userId, algorithm: "none" });

    expect(verifyAccessToken(otherSecret)).toBeNull();
    expect(verifyAccessToken(unsigned)).toBeNull();
  });

  it("are refused when they carry an old numeric id", () => {
    const oldToken = jwt.sign({ role: "USER" }, testEnv.JWT_ACCESS_SECRET, { subject: "1" });
    expect(verifyAccessToken(oldToken)).toBeNull();
  });

  it("are refused when the value is not a token", () => {
    expect(verifyAccessToken("")).toBeNull();
    expect(verifyAccessToken("not-a-token")).toBeNull();
  });
});
