import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run integration tests (files matching *.integration.test.ts) against the test DB.
    // Pure helper tests (*.test.ts) still run without DB access.
    include: ["src/**/*.test.ts"],
    // Setup file that sets DATABASE_URL before any imports
    setupFiles: ["src/test/setup.ts"],
    // Use the test database — set BEFORE any module imports @nirman/db
    env: {
      DATABASE_URL: "postgresql://sparshagarwal@localhost:5432/nirman_inventory_test?schema=public",
      NODE_ENV: "test",
    },
    // Integration tests are slower — give them more time
    testTimeout: 30000,
    // Run tests sequentially (not in parallel) — they share a DB
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
