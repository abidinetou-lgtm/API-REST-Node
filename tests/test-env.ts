// Tests use their own database so they never touch development data
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5434/tickets_test";

export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: "http://localhost:5173",
  CORS_ORIGIN: "http://localhost:5173",
  JWT_ACCESS_SECRET: "test-secret-that-is-long-enough-for-validation",
  // Empty key: emails are printed instead of being sent
  BREVO_API_KEY: "",
  MAIL_FROM_EMAIL: "no-reply@example.com",
  MAIL_FROM_NAME: "Support Ticket",
};
