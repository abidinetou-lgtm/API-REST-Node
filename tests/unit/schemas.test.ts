import { describe, expect, it } from "vitest";
import { loginSchema, passwordSchema } from "../../src/schemas/auth.schema.js";
import { createTicketSchema, listTicketsSchema, ticketIdSchema } from "../../src/schemas/ticket.schema.js";
import { changeRoleSchema, createUserSchema } from "../../src/schemas/user.schema.js";

describe("emails", () => {
  it("are trimmed and lowercased", () => {
    const { email } = loginSchema.parse({ email: "  Paul.Martin@Example.COM ", password: "x" });
    expect(email).toBe("paul.martin@example.com");
  });

  it("must be valid", () => {
    expect(loginSchema.safeParse({ email: "paul.example.com", password: "x" }).success).toBe(false);
  });
});

describe("passwords", () => {
  it("require 12+ characters, mixed case, a digit, and reject common passwords", () => {
    expect(passwordSchema.safeParse("Sh0rtPass").success).toBe(false); // too short (9)
    expect(passwordSchema.safeParse("12345678").success).toBe(false); // short + no letters
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false); // no uppercase
    expect(passwordSchema.safeParse("NOLOWERCASE12").success).toBe(false); // no lowercase
    expect(passwordSchema.safeParse("NoDigitsHere!").success).toBe(false); // no digit
    expect(passwordSchema.safeParse("Password1234").success).toBe(false); // too common
    expect(passwordSchema.safeParse("Str0ngPassw0rd").success).toBe(true); // valid
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false); // too long
  });
});

describe("tickets", () => {
  it("are trimmed and only keep the known fields", () => {
    const ticket = createTicketSchema.parse({
      title: "  Printer jammed  ",
      description: "The printer does not print",
      status: "CLOSED",
      createdById: "someone-else",
    });

    expect(ticket).toEqual({ title: "Printer jammed", description: "The printer does not print" });
  });

  it("need an id in the UUID format", () => {
    expect(ticketIdSchema.safeParse({ id: "1" }).success).toBe(false);
    expect(ticketIdSchema.safeParse({ id: "0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70" }).success).toBe(true);
  });
});

describe("ticket list query", () => {
  it("has default values", () => {
    expect(listTicketsSchema.parse({})).toEqual({ page: 1, limit: 20, order: "desc", sort: "createdAt" });
  });

  it("converts the URL values", () => {
    const query = listTicketsSchema.parse({
      page: "3",
      limit: "50",
      status: "OPEN, IN_PROGRESS",
      createdFrom: "2026-10-01",
    });

    expect(query).toMatchObject({ page: 3, limit: 50, status: ["OPEN", "IN_PROGRESS"] });
    expect(query.createdFrom).toEqual(new Date("2026-10-01"));
  });

  it("rejects out of range or unknown values", () => {
    for (const query of [
      { limit: "101" },
      { page: "0" },
      { page: "1.5" },
      { sort: "passwordHash" },
      { order: "random" },
      { status: "OPEN,DONE" },
      { createdFrom: "not-a-date" },
      { createdFrom: "2026-10-02", createdTo: "2026-10-01" },
    ]) {
      expect(listTicketsSchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});

describe("roles", () => {
  it("never allow to create or promote a super admin", () => {
    expect(changeRoleSchema.safeParse({ role: "SUPER_ADMIN" }).success).toBe(false);
    expect(
      createUserSchema.safeParse({ email: "boss@example.com", name: "Boss", role: "SUPER_ADMIN" }).success,
    ).toBe(false);
    expect(changeRoleSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
  });
});
