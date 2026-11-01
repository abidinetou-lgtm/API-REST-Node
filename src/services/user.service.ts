import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { sendInvitation } from "./user-token.service.js";
import { revokeAllSessions } from "./auth.service.js";
import { paginated, paginationArgs } from "../utils/pagination.js";
import type { CreateUserInput, ListUsersQuery } from "../schemas/user.schema.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Role } from "../generated/prisma/enums.js";

type Actor = { id: string; role: Role };

type UserRecord = {
  id: string;
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

async function findUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  }
  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, "EMAIL_ALREADY_IN_USE", "Email already in use");
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

export async function resendInvitation(id: string) {
  const user = await findUserOrThrow(id);

  if (user.passwordHash) {
    throw new HttpError(409, "INVITATION_ALREADY_ACCEPTED", "Invitation already accepted");
  }
  if (!user.isActive) {
    throw new HttpError(409, "ACCOUNT_DISABLED", "Account disabled");
  }

  await sendInvitation(user);
}

const statusFilters: Record<ListUsersQuery["status"] & string, Prisma.UserWhereInput> = {
  PENDING: { isActive: true, passwordHash: null },
  ACTIVE: { isActive: true, passwordHash: { not: null } },
  DISABLED: { isActive: false },
};

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    AND: [
      query.role ? { role: { in: query.role } } : {},
      query.status ? statusFilters[query.status] : {},
      query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: [{ [query.sort]: query.order }, { id: query.order }],
      ...paginationArgs(query),
    }),
    prisma.user.count({ where }),
  ]);

  return paginated(users.map(toPublicUser), total, query);
}

export async function getUser(id: string) {
  return toPublicUser(await findUserOrThrow(id));
}

// Super admin can manage everyone else, admins can only manage agents and users
function canManage(actor: Actor, targetRole: Role) {
  if (targetRole === "SUPER_ADMIN") return false;
  if (actor.role === "SUPER_ADMIN") return true;
  return actor.role === "ADMIN" && (targetRole === "AGENT" || targetRole === "USER");
}

export async function setUserActive(actor: Actor, id: string, isActive: boolean) {
  if (actor.id === id) {
    throw new HttpError(400, "CANNOT_MANAGE_OWN_ACCOUNT", "You cannot change the status of your own account");
  }

  const target = await findUserOrThrow(id);
  if (!canManage(actor, target.role)) {
    throw new HttpError(403, "FORBIDDEN", "Forbidden");
  }

  const user = await prisma.user.update({ where: { id }, data: { isActive } });

  if (!isActive) {
    await revokeAllSessions(id);
  }

  return toPublicUser(user);
}
