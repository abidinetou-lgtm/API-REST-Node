import { z } from "zod";
import { Role } from "../generated/prisma/enums.js";
import { emailSchema } from "./auth.schema.js";
import { commaList, paginationSchema, searchSchema } from "./pagination.schema.js";

// A super admin cannot be created or promoted through the API
const assignableRoleSchema = z.enum(["ADMIN", "AGENT", "USER"]);

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(100),
  role: assignableRoleSchema,
});

export const changeRoleSchema = z.object({
  role: assignableRoleSchema,
});

export const userIdSchema = z.object({
  id: z.uuid(),
});

export const listUsersSchema = paginationSchema.extend({
  role: commaList(z.enum(Role)).optional(),
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"]).optional(),
  search: searchSchema.optional(),
  sort: z.enum(["createdAt", "name", "email"]).default("createdAt"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>;
