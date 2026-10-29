import { prisma } from "../lib/prisma.js";
import { sendEmail } from "../lib/mailer.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import { invitationEmail } from "../lib/email-templates.js";
import type { TokenType } from "../generated/prisma/enums.js";

const INVITATION_TTL_HOURS = 48;

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

export async function sendInvitation(user: UserIdentity) {
  const token = await createUserToken(user.id, "INVITATION", INVITATION_TTL_HOURS * 60 * 60 * 1000);
  await sendEmail({ to: user.email, ...invitationEmail(user.name, token, INVITATION_TTL_HOURS) });
}
