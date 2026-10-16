// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Scoped mutation run — the guard regions the hardening sweep added/fixed.
  // Full-file mutation on these services would take hours; mutating the guard
  // lines asks the pointed question: does a test die if this guard flips?
  mutate: [
    "src/boq.ts:811-816",            // MB re-reject guard
    "src/hr.ts:2827-2832",          // DPR re-reject guard
    "src/supplier-return.ts:368-372", // re-cancel guard
    "src/supplier-payment.ts:177-215", // dupe-reference + window dedup
    "src/issue.ts:749-756",          // PENDING-cancel must not restore stock
    "src/safety.ts:272-286",         // incident cancel+delete guards
    "src/safety.ts:537-550",         // inspection cancel+delete guards
  ],
  // pnpm's strict layout means the plugin name doesn't resolve from Stryker's
  // own install dir — point at the file directly.
  plugins: [
    "file:///Users/sparshagarwal/Downloads/nirman-inventory/node_modules/.pnpm/@stryker-mutator+vitest-runner@9.5.0_@stryker-mutator+core@9.5.0_@types+node@20.19.43_s_d1ea7cda855ce180ecd5daebf0ce9b90/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js",
  ],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: { fileName: "reports/mutation/mutation-report.html" },
  // DB-backed tests share one postgres — keep concurrency at 1 so mutants
  // can't interleave with each other's seed data.
  concurrency: 1,
  timeoutMS: 90000,
  timeoutFactor: 2,
  ignoreStatic: true,
};
