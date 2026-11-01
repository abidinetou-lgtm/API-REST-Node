import { describe, expect, it } from "vitest";
import { createUser, login } from "./helpers.js";

describe("Login rate limit", () => {
  it("blocks after 10 failed attempts", async () => {
    const user = await createUser();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await login(user.email, "WrongPassword1")).res.status).toBe(401);
    }

    const { res } = await login(user.email);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });
});
