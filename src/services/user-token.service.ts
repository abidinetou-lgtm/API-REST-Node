import { prisma } from "../lib/prisma.js";
import { sendEmail } from "../lib/mailer.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import { invitationEmail, passwordResetEmail } from "../lib/email-templates.js";
import { HttpError } from "../utils/http-error.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { TokenType } from "../generated/prisma/enums.js";

const INVITATION_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_MINUTES = 30;

type UserIdentity = { id: number; email: string; name: string };

async function createUserToken(userId: number, type: TokenType, ttlMs: number) {
  const token = generateToken();

  // Only the latest link stays valid
  await prisma.userToken.deleteMany({ where: { userId, type, usedAt: null } });
  await prisma.userToken.create({
    data: {
      tokenHash: hashToken(token),
      type,
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  return token;
}

// Marks the token as used and returns its user id. Must run inside a transaction
// so the token is only consumed if the rest of the operation succeeds.
export async function consumeUserToken(tx: Prisma.TransactionClient, token: string, type: TokenType) {
  const tokenHash = hashToken(token);

  // Conditional update: two concurrent requests with the same token cannot both succeed
  const { count } = await tx.userToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  if (count === 0) {
    throw new HttpError(400, "Invalid or expired token");
  }

  const userToken = await tx.userToken.findUniqueOrThrow({ where: { tokenHash } });
  return userToken.userId;
}

export async function sendInvitation(user: UserIdentity) {
  const token = await createUserToken(user.id, "INVITATION", INVITATION_TTL_HOURS * 60 * 60 * 1000);
  await sendEmail({ to: user.email, ...invitationEmail(user.name, token, INVITATION_TTL_HOURS) });
}

export async function sendPasswordReset(user: UserIdentity) {
  const token = await createUserToken(user.id, "PASSWORD_RESET", PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await sendEmail({ to: user.email, ...passwordResetEmail(user.name, token, PASSWORD_RESET_TTL_MINUTES) });
}
