import { describe, expect, it } from "vitest";
import { createUser, login } from "./helpers.js";

describe("Login rate limit per IP address", () => {
  it("blocks an address after 10 failed attempts on different accounts", async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await login(`unknown${attempt}@example.com`, "WrongPassword1")).res.status).toBe(401);
    }

    const user = await createUser();
    const { res } = await login(user.email);
    expect(res.status).toBe(429);
  });
});
