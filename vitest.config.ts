import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/test-env.ts";

export default defineConfig({
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/integration/global-setup.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          // All test files share the same database
          fileParallelism: false,
          testTimeout: 15000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
