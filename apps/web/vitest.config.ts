import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react() as any],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    // Pure-logic tests (nav.test.ts, lib tests, API route tests) run in node.
    // Component/page render tests opt into jsdom via the @vitest-environment
    // docblock at the top of the file. This keeps the fast node-env tests fast
    // while letting us render React where needed.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // Coverage: report across all src files so we see untested pages/components/API routes.
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/types.ts",
        "src/**/generated/**",
        "src/instrumentation.ts",
        "src/sentry.{client,server}.config.ts",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "src/app/**/global-error.tsx",
      ],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
