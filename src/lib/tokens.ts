import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import type { Role } from "../generated/prisma/enums.js";

export function signAccessToken(user: { id: string; role: Role }, sessionId: number) {
  return jwt.sign({ role: user.role, sid: sessionId }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    algorithm: "HS256",
  });
}

// Returns the user id and the session id (the refresh token this access token belongs to),
// or null if the token is invalid or expired.
export function verifyAccessToken(token: string): { userId: string; sessionId: number } | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;

    const userId = z.uuid().safeParse(payload.sub);
    const sessionId = z.number().int().safeParse(payload.sid);
    // A token without a valid user id or session id (e.g. issued before this change) is rejected
    if (!userId.success || !sessionId.success) return null;
    return { userId: userId.data, sessionId: sessionId.data };
  } catch {
    return null;
  }
}

// Opaque random token for refresh, invitation and password reset
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

// Tokens are stored hashed. SHA-256 is enough here because the tokens are long random values,
// unlike passwords which need a slow hash.
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
