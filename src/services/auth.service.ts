import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateToken, hashToken, signAccessToken } from "../lib/tokens.js";
import { HttpError } from "../utils/http-error.js";
import { consumeUserToken } from "./user-token.service.js";
import type { Role } from "../generated/prisma/enums.js";

// Compared against when the email is unknown, so the response time does not reveal
// whether an account exists
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

type SessionUser = { id: number; email: string; name: string; role: Role };

async function createSession(user: SessionUser) {
  const refreshToken = generateToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    await verifyPassword(await dummyHash, password);
    throw new HttpError(401, "Invalid credentials");
  }

  const isValid = await verifyPassword(user.passwordHash, password);
  if (!isValid) {
    throw new HttpError(401, "Invalid credentials");
  }

  if (!user.isActive) {
    throw new HttpError(403, "Account disabled");
  }

  return createSession(user);
}

export async function acceptInvitation(token: string, password: string) {
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const userId = await consumeUserToken(tx, token, "INVITATION");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.isActive) {
      throw new HttpError(403, "Account disabled");
    }

    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
  });
}
