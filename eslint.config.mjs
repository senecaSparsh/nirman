/**
 * Root ESLint config (flat config) — used by lint-staged from the workspace root.
 *
 * `apps/web` has its own `eslint.config.mjs` that is used when `pnpm --filter web lint`
 * runs from within that directory. This root config covers ALL files so that
 * lint-staged (which runs from the repo root) can lint both `apps/web/**` and
 * `packages/**` files without needing to cd into each package.
 *
 * Resolution: ESLint flat config searches from CWD, not from the file's location.
 * So when lint-staged runs `eslint` from the root, this config is used. When
 * `pnpm --filter web lint` runs from `apps/web`, that package's config is used.
 */
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/*.config.{js,mjs,ts}",
      "**/vitest.setup.ts",
      // Generated Prisma client — not hand-written code
      "packages/db/src/generated/**",
    ],
  },

  // ── apps/web: full Next.js + TypeScript rules ───────────────────
  // Spread the Next.js flat configs so React/JSX rules apply to web files.
  ...nextCoreWebVitals,
  ...nextTypescript,

  // ── Shared rules for all TS/TSX files ───────────────────────────
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Ban native browser dialogs — use ConfirmDialog / useConfirm / toast
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message:
            "Use the useConfirm hook from @/lib/use-confirm instead of native confirm().",
        },
        {
          name: "alert",
          message: "Use toast from sonner instead of native alert().",
        },
        {
          name: "prompt",
          message:
            "Use a Dialog with an input field instead of native prompt().",
        },
      ],
      // React 19 compiler rules — downgrade to warnings (see apps/web config)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
);
