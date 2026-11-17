// Tests use their own database so they never touch development data
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5434/tickets_test";

export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: "http://localhost:5173",
  CORS_ORIGIN: "http://localhost:5173",
  JWT_ACCESS_SECRET: "test-secret-that-is-long-enough-for-validation",
  // The docs are now off by default; the tests enable them explicitly to check the /docs route
  DOCS_ENABLED: "true",
  // Empty key: emails are printed instead of being sent
  BREVO_API_KEY: "",
  MAIL_FROM_EMAIL: "no-reply@example.com",
  MAIL_FROM_NAME: "Support Ticket",
  // Empty key: the tests never call a real AI, even if a key is in .env. The AI tests use a fake one.
  // The other values are set so that the AI settings of .env never change the tests.
  AI_API_KEY: "",
  AI_PROVIDER: "openai",
  AI_MODEL: "",
  AI_PROMPT_ID: "",
  AI_PROMPT_VERSION: "",
  AI_BASE_URL: "",
  AI_MAX_AUTO_REPLIES: "3",
};
