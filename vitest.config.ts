import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/test-env.ts";

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // All test files share the same database
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
