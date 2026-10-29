import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-env.js";

// Runs once before all tests: brings the test database schema up to date
export default function setup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
