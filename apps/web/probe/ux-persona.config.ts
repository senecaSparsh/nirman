import { defineConfig, devices } from "@playwright/test";

/** UX-persona probe — real sign-in experience on the prod build. */
export default defineConfig({
  testDir: "./e2e",
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.BASE || "http://localhost:3200",
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] }, testMatch: "**/ux-persona.spec.ts" }],
});
