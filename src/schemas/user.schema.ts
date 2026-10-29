import { z } from "zod";
import { emailSchema } from "./auth.schema.js";

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(100),
  // A super admin cannot be created through the API
  role: z.enum(["ADMIN", "AGENT", "USER"]),
});

export const userIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
