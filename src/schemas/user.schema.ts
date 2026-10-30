import { z } from "zod";
import { Role } from "../generated/prisma/enums.js";
import { emailSchema } from "./auth.schema.js";
import { commaList, paginationSchema, searchSchema } from "./pagination.schema.js";

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(100),
  // A super admin cannot be created through the API
  role: z.enum(["ADMIN", "AGENT", "USER"]),
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
export type ListUsersQuery = z.infer<typeof listUsersSchema>;
