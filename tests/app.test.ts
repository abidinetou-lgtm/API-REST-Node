import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("App", () => {
  it("answers on /health", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns 404 for an unknown route", async () => {
    const res = await api().get("/unknown");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await api().post("/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid JSON");
  });

  it("returns 413 when the body is too large", async () => {
    const res = await api()
      .post("/auth/login")
      .send({ email: "a@example.com", password: "x".repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it("sends security headers", async () => {
    const res = await api().get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("only allows the configured origin", async () => {
    const allowed = await api().get("/health").set("Origin", "http://localhost:5173");
    const refused = await api().get("/health").set("Origin", "https://evil.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(refused.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
