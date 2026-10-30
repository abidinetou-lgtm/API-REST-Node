import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(128, "Password must contain at most 128 characters");

const tokenSchema = z.string().min(1).max(200);

export const loginSchema = z.object({
  email: emailSchema,
  // No strength rules on login: they only apply when a password is set
  password: z.string().min(1).max(128),
});

export const acceptInvitationSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TokenPasswordInput = z.infer<typeof acceptInvitationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
