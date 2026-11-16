import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import type { Role } from "../generated/prisma/enums.js";

export function signAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    algorithm: "HS256",
  });
}

// Returns the user id, or null if the token is invalid or expired
export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;

    // Tokens issued before the switch to UUIDs carry a numeric id
    const userId = z.uuid().safeParse(payload.sub);
    return userId.success ? userId.data : null;
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
