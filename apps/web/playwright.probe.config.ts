import { defineConfig, devices } from "@playwright/test";

/**
 * Button-probe config — Layer 5 (UI "every button" coverage).
 *
 * Separate from playwright.config.ts on purpose: this spec CLICKS buttons,
 * it doesn't just load pages — ~150 pages × ~20 buttons is a long run that
 * shouldn't ride along in `pnpm e2e`. Same webServer (auto-starts dev on
 * :3100 with AUTH_BYPASS), same single-worker serial execution.
 *
 * Run:  pnpm --filter web e2e:probe
 * Report: probe/button-report.json (gitignored)
 */
const PORT = 3100;
// Point at an already-running dev server (e.g. `pnpm dev` on :3000) to skip
// the spawned server entirely — two `next dev` instances fight over the
// .next lock. The spec authenticates via /api/auth/demo-login in that mode.
const PROBE_BASE = process.env.PROBE_BASE;
const baseURL = PROBE_BASE ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./probe",
  workers: 4,
  // One spec file holds every page — without fullyParallel it all serializes
  // into a single worker no matter what `workers` says.
  fullyParallel: true,
  retries: 1, // cold-compile + machine-suspend flakes self-heal on a warm second hit
  reporter: [["list"]],
  timeout: 300_000, // cold Turbopack compiles can eat most of the budget on first hit
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    // grep splits the suite — desktop spec under Desktop Chrome, mobile
    // spec under the same project (its own test.use sets iPhone chrome).
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, grep: /@probe-desktop/ },
    { name: "mobile", use: { ...devices["Desktop Chrome"] }, grep: /@probe-mobile/ },
  ],
  // No webServer when PROBE_BASE is set — the caller owns that server.
  ...(PROBE_BASE
    ? {}
    : {
        webServer: {
          command: "AUTH_BYPASS=true NEXT_PUBLIC_AUTH_BYPASS=true PORT=3100 pnpm dev:raw",
          url: `${baseURL}/api/health`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
        },
      }),
});
