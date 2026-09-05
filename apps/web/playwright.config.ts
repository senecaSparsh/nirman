import { defineConfig, devices } from "@playwright/test";

/**
 * Nirman Inventory OS — Playwright E2E config.
 *
 * Tests run against the real Next.js dev server with AUTH_BYPASS=true
 * (set in .env). The dev server is auto-started on port 3100 if not
 * already running. Role switching is done via the x-test-role header
 * (read by getDevBypassUser in src/lib/server.ts), so we can test RBAC
 * without spinning up real auth sessions.
 *
 * Run:  pnpm --filter web e2e
 *        pnpm --filter web e2e:ui      (interactive UI mode)
 *        pnpm --filter web e2e:smoke   (smoke tests only)
 *        pnpm --filter web e2e:flows   (deep flow tests only)
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The Next.js dev server (Turbopack) compiles pages on-demand. With 130+
  // mobile pages + 100+ desktop pages, 6 workers overwhelm the dev server
  // causing ERR_ABORTED / timeout failures that are NOT real bugs. 2 workers
  // keeps the server responsive while still parallelizing.
  workers: process.env.CI ? 2 : 2,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // AUTH_BYPASS is in .env; the dev server reads it. No login needed.
    // Role switching is done per-test via the `role` fixture (x-test-role header).
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "PORT=3100 pnpm dev:raw",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
