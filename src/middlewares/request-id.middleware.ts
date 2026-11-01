import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// Lets a client report an error with an id that can be found in the server logs
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};
