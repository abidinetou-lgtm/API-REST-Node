import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),

    APP_URL: z.url(),
    CORS_ORIGIN: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

    BREVO_API_KEY: z.string().optional(),
    MAIL_FROM_EMAIL: z.email(),
    MAIL_FROM_NAME: z.string().min(1).default("Support Ticket"),

    SUPER_ADMIN_EMAIL: z.email().optional(),
  })
  .refine((env) => env.NODE_ENV !== "production" || Boolean(env.BREVO_API_KEY), {
    message: "BREVO_API_KEY is required in production",
    path: ["BREVO_API_KEY"],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
