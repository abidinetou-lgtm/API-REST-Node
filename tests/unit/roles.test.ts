import { describe, expect, it } from "vitest";
import { canManage } from "../../src/utils/roles.js";
import type { Role } from "../../src/generated/prisma/enums.js";

describe("canManage", () => {
  // Row: who acts, columns: on whom
  const expected: Record<Role, Record<Role, boolean>> = {
    SUPER_ADMIN: { SUPER_ADMIN: false, ADMIN: true, AGENT: true, USER: true },
    ADMIN: { SUPER_ADMIN: false, ADMIN: false, AGENT: true, USER: true },
    AGENT: { SUPER_ADMIN: false, ADMIN: false, AGENT: false, USER: false },
    USER: { SUPER_ADMIN: false, ADMIN: false, AGENT: false, USER: false },
  };

  for (const [actor, targets] of Object.entries(expected)) {
    for (const [target, allowed] of Object.entries(targets)) {
      it(`${allowed ? "lets" : "does not let"} ${actor} manage ${target}`, () => {
        expect(canManage(actor as Role, target as Role)).toBe(allowed);
      });
    }
  }
});
