import type { Request, RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { HttpError } from "../utils/http-error.js";
import type { Role } from "../generated/prisma/enums.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;

  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  // Loaded on every request so that a disabled account or a role change applies immediately
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, "Authentication required");
  }

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
};

export function currentUser(req: Pick<Request, "user">) {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }
  return req.user;
}

// Must be used after authenticate
export function authorize(roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      throw new HttpError(403, "Forbidden");
    }
    next();
  };
}
