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

    // API documentation on /docs, hidden in production unless enabled
    DOCS_ENABLED: z.stringbool().optional(),

    // AI that answers the tickets. Disabled while AI_API_KEY is empty.
    AI_PROVIDER: z.enum(["openai", "deepseek"]).default("openai"),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    // Prompt saved in the OpenAI dashboard (pmpt_...): its model and reference instructions are used.
    // Without a version, the version published in the dashboard is used.
    AI_PROMPT_ID: z.string().startsWith("pmpt_").optional(),
    AI_PROMPT_VERSION: z.string().optional(),
    // Only to use another address than the provider's default one (a proxy, a regional endpoint...)
    AI_BASE_URL: z.url().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    // Automatic answers in a row before a person of the support team must take over
    AI_MAX_AUTO_REPLIES: z.coerce.number().int().min(0).default(3),
  })
  .refine((env) => env.NODE_ENV !== "production" || Boolean(env.BREVO_API_KEY), {
    message: "BREVO_API_KEY is required in production",
    path: ["BREVO_API_KEY"],
  })
  .refine((env) => !env.AI_API_KEY || Boolean(env.AI_MODEL || env.AI_PROMPT_ID), {
    message: "AI_MODEL or AI_PROMPT_ID is required when AI_API_KEY is set",
    path: ["AI_MODEL"],
  })
  .refine((env) => !env.AI_PROMPT_ID || env.AI_PROVIDER === "openai", {
    message: "AI_PROMPT_ID only works with the openai provider",
    path: ["AI_PROMPT_ID"],
  });

// An empty value (KEY="" as in .env.example) means the variable is not set
const definedValues = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

const parsed = envSchema.safeParse(definedValues);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  DOCS_ENABLED: parsed.data.DOCS_ENABLED ?? parsed.data.NODE_ENV !== "production",
};
