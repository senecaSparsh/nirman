import { defineConfig } from "vitest/config";

/**
 * Mutation-scoped vitest config — used ONLY by stryker.config.mjs.
 *
 * The full suite (~1,750 DB-backed tests) is too heavy to re-run per mutant:
 * the initial coverage run alone SIGABRT'd Stryker. This config narrows the
 * run to guard-regressions.test.ts (~12 tests), so each mutant costs one
 * fast, focused pass — and every mutate: region in stryker.config.mjs has a
 * covering test in that file by construction.
 *
 * Everything else mirrors vitest.config.ts — same test DB, same single-fork
 * pool (mutants share one postgres; parallel mutation runs would clobber
 * each other's seed data via resetDb's TRUNCATE).
 */
export default defineConfig({
  test: {
    include: ["src/test/guard-regressions.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://sparshagarwal@localhost:5432/nirman_inventory_test?schema=public",
      NODE_ENV: "test",
    },
    testTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
