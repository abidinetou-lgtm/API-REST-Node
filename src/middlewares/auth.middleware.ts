import type { Request, RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { HttpError } from "../utils/http-error.js";
import type { Role } from "../generated/prisma/enums.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }

  // Loaded on every request so that a disabled account or a role change applies immediately
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }

  // The session behind this access token must still be active. Logging out, rotating the refresh
  // token or resetting the password revokes it, which immediately invalidates the access token.
  const session = await prisma.refreshToken.findUnique({
    where: { id: payload.sessionId },
    select: { revokedAt: true, userId: true },
  });

  if (!session || session.revokedAt !== null || session.userId !== user.id) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
};

export function currentUser(req: Pick<Request, "user">) {
  if (!req.user) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  }
  return req.user;
}

// Must be used after authenticate
export function authorize(roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      throw new HttpError(403, "FORBIDDEN", "Forbidden");
    }
    next();
  };
}
