import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "../../src/generated/prisma/client.js";
import { authorize } from "../../src/middlewares/auth.middleware.js";
import { errorHandler } from "../../src/middlewares/error.middleware.js";
import { validate } from "../../src/middlewares/validate.middleware.js";
import { HttpError } from "../../src/utils/http-error.js";

function fakeResponse() {
  const res = {
    locals: { requestId: "request-1" },
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function run(handler: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>) {
  const res = fakeResponse();
  const next = vi.fn();
  handler(req as Request, res as unknown as Response, next);
  return { res, next };
}

describe("validate", () => {
  const schemas = {
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ page: z.coerce.number().default(1) }),
    body: z.object({ name: z.string().trim() }),
  };

  it("replaces the request data with the parsed values", () => {
    const req = { params: { id: "7" }, query: {}, body: { name: "  Paul ", admin: true } };
    const { res, next } = run(validate(schemas), req as Partial<Request>);

    expect(next).toHaveBeenCalledOnce();
    expect(req.params).toEqual({ id: 7 });
    expect(req.body).toEqual({ name: "Paul" });
    expect(res.locals).toMatchObject({ query: { page: 1 } });
  });

  it("throws a ZodError for invalid data", () => {
    expect(() => run(validate(schemas), { params: {}, query: {}, body: {} })).toThrow(z.ZodError);
  });
});

describe("authorize", () => {
  const user = { id: "1", email: "a@example.com", name: "A" };

  it("lets the allowed roles through", () => {
    const { next } = run(authorize(["ADMIN"]), { user: { ...user, role: "ADMIN" } });
    expect(next).toHaveBeenCalledOnce();
  });

  it("refuses the other roles with 403", () => {
    expect(() => run(authorize(["ADMIN"]), { user: { ...user, role: "AGENT" } })).toThrow(
      expect.objectContaining({ status: 403, code: "FORBIDDEN" }),
    );
  });

  it("refuses a request without user with 401", () => {
    expect(() => run(authorize(["ADMIN"]), {})).toThrow(expect.objectContaining({ status: 401 }));
  });
});

describe("errorHandler", () => {
  function handle(error: unknown) {
    const res = fakeResponse();
    errorHandler(error, {} as Request, res as unknown as Response, vi.fn());
    return res;
  }

  function prismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError("Database error", { code, clientVersion: "test" });
  }

  it("keeps the status and code of an HttpError", () => {
    const res = handle(new HttpError(404, "TICKET_NOT_FOUND", "Ticket not found"));

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: { code: "TICKET_NOT_FOUND", message: "Ticket not found", requestId: "request-1" },
    });
  });

  it("lists the invalid fields of a ZodError", () => {
    const result = z.object({ title: z.string(), tags: z.array(z.string()) }).safeParse({ tags: [1] });
    const res = handle(result.error);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        details: [expect.objectContaining({ field: "title" }), expect.objectContaining({ field: "tags.0" })],
      },
    });
  });

  it("translates the Prisma errors", () => {
    expect(handle(prismaError("P2025")).statusCode).toBe(404);
    expect(handle(prismaError("P2002")).statusCode).toBe(409);
  });

  it("never sends the details of an unexpected error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = handle(new Error("password=secret in connection string"));

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(consoleError).toHaveBeenCalledWith("[request-1]", expect.any(Error));
    consoleError.mockRestore();
  });
});
