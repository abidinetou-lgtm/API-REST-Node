import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError, sendError } from "../utils/http-error.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    sendError(res, 400, "VALIDATION_FAILED", "Validation failed", details);
    return;
  }

  // Errors raised by express.json() while reading the body
  if (err?.type === "entity.parse.failed") {
    sendError(res, 400, "INVALID_JSON", "Invalid JSON");
    return;
  }

  if (err?.type === "entity.too.large") {
    sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body too large");
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      sendError(res, 404, "NOT_FOUND", "Resource not found");
      return;
    }

    if (err.code === "P2002") {
      sendError(res, 409, "CONFLICT", "Resource already exists");
      return;
    }
  }

  console.error(`[${res.locals.requestId}]`, err);
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
};
