import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Schemas = {
  params?: ZodType;
  body?: ZodType;
};

// Replaces req.params and req.body with the parsed data, a ZodError goes to the error handler
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    next();
  };
}
