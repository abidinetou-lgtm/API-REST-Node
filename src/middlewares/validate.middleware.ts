import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Schemas = {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
};

// Replaces req.params and req.body with the parsed data, the parsed query goes to res.locals.query.
// A ZodError goes to the error handler.
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    if (schemas.query) {
      // req.query is read-only in Express 5
      res.locals.query = schemas.query.parse(req.query);
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    next();
  };
}
