import { describe, expect, it } from "vitest";
import { createUser, login } from "./helpers.js";

describe("Login rate limit per account", () => {
  it("blocks an account after 5 failed attempts, even with the right password", async () => {
    const target = await createUser({ email: "target@example.com" });
    const other = await createUser();

    // Written differently, it is still the same account
    for (const email of ["target@example.com", "TARGET@example.com", "Target@Example.com", " target@example.com", "TARGET@EXAMPLE.COM"]) {
      expect((await login(email, "WrongPassword1")).res.status).toBe(401);
    }

    const { res } = await login(target.email);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(res.headers["ratelimit-policy"]).toBeDefined();

    // Other accounts are not affected
    expect((await login(other.email)).res.status).toBe(200);
  });
});
