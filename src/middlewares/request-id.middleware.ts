import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { runWithRequestContext } from "../lib/request-context.js";

// Lets a client report an error with an id that can be found in the server logs
export const requestId: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  runWithRequestContext({ requestId: id, ip: req.ip }, next);
};
