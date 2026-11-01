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
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("answers every error with the same format and a request id", async () => {
    const res = await api().get("/tickets");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
        requestId: res.headers["x-request-id"],
      },
    });
  });

  it("gives each request its own id", async () => {
    const first = await api().get("/health");
    const second = await api().get("/health");

    expect(first.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await api().post("/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
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
