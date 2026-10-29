import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { sendInvitation } from "./user-token.service.js";
import { revokeAllSessions } from "./auth.service.js";
import type { CreateUserInput } from "../schemas/user.schema.js";
import type { Role } from "../generated/prisma/enums.js";

type Actor = { id: number; role: Role };

type UserRecord = {
  id: number;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicUser({ passwordHash, ...user }: UserRecord) {
  const status = !user.isActive ? "DISABLED" : passwordHash ? "ACTIVE" : "PENDING";
  return { ...user, status };
}

async function findUserOrThrow(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, "Email already in use");
  }

  const user = await prisma.user.create({ data: input });

  // The account is kept even if the email fails: the invitation can be sent again later
  let invitationSent = true;
  try {
    await sendInvitation(user);
  } catch (error) {
    console.error(error);
    invitationSent = false;
  }

  return { user: toPublicUser(user), invitationSent };
}

export async function resendInvitation(id: number) {
  const user = await findUserOrThrow(id);

  if (user.passwordHash) {
    throw new HttpError(409, "Invitation already accepted");
  }
  if (!user.isActive) {
    throw new HttpError(409, "Account disabled");
  }

  await sendInvitation(user);
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return users.map(toPublicUser);
}

export async function getUser(id: number) {
  return toPublicUser(await findUserOrThrow(id));
}

// Super admin can manage everyone else, admins can only manage agents and users
function canManage(actor: Actor, targetRole: Role) {
  if (targetRole === "SUPER_ADMIN") return false;
  if (actor.role === "SUPER_ADMIN") return true;
  return actor.role === "ADMIN" && (targetRole === "AGENT" || targetRole === "USER");
}

export async function setUserActive(actor: Actor, id: number, isActive: boolean) {
  if (actor.id === id) {
    throw new HttpError(400, "You cannot change the status of your own account");
  }

  const target = await findUserOrThrow(id);
  if (!canManage(actor, target.role)) {
    throw new HttpError(403, "Forbidden");
  }

  const user = await prisma.user.update({ where: { id }, data: { isActive } });

  if (!isActive) {
    await revokeAllSessions(id);
  }

  return toPublicUser(user);
}
