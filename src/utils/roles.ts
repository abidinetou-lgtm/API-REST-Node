import type { Role } from "../generated/prisma/enums.js";

// Support team: can see every ticket and change its status
export const STAFF_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "AGENT"];

// Can manage user accounts
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN"];
