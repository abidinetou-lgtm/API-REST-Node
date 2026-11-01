import type { Response } from "express";

// `code` is stable and meant for the client code, `message` is meant for humans and may change
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: res.locals.requestId,
    },
  });
}
