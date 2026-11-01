import type { Role } from "../generated/prisma/enums.js";

// Support team: can see every ticket and change its status
export const STAFF_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "AGENT"];

// Can manage user accounts
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN"];

// Super admin can manage everyone else, admins can only manage agents and users
export function canManage(actorRole: Role, targetRole: Role) {
  if (targetRole === "SUPER_ADMIN") return false;
  if (actorRole === "SUPER_ADMIN") return true;
  return actorRole === "ADMIN" && (targetRole === "AGENT" || targetRole === "USER");
}
