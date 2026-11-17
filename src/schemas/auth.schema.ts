import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// The passwords attackers try first. Rejected whatever their length. A production app would
// check against a much larger corpus (e.g. the Have I Been Pwned list); this covers the obvious ones.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "password1234", "motdepasse", "motdepasse12",
  "12345678", "123456789", "1234567890", "azerty123456", "qwerty123456", "qwertyuiop",
  "azertyuiop", "iloveyou1234", "administrator", "welcome1234", "changeme1234",
]);

// NIST 800-63B: length matters most. We also ask for some variety and reject the passwords
// everyone tries first, so an account can no longer be "protected" by 12345678.
export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must contain at most 128 characters")
  .refine((value) => /[a-z]/.test(value), { message: "Password must contain a lowercase letter" })
  .refine((value) => /[A-Z]/.test(value), { message: "Password must contain an uppercase letter" })
  .refine((value) => /[0-9]/.test(value), { message: "Password must contain a digit" })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), { message: "This password is too common" });

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
