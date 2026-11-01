import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("passwords", () => {
  it("are hashed with argon2id and a random salt", async () => {
    const first = await hashPassword("Str0ngPassw0rd");
    const second = await hashPassword("Str0ngPassw0rd");

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toContain("Str0ngPassw0rd");
    expect(first).not.toBe(second);
  });

  it("are verified against their hash", async () => {
    const hash = await hashPassword("Str0ngPassw0rd");

    expect(await verifyPassword(hash, "Str0ngPassw0rd")).toBe(true);
    expect(await verifyPassword(hash, "str0ngpassw0rd")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });
});
