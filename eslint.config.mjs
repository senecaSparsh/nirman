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

// ── Custom plugin: no-process-env-node-env-in-client ─────────────
// (duplicated from apps/web/eslint.config.mjs so the root config also
// knows about this rule when lint-staged runs from the repo root)
const noProcessEnvInClientPlugin = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow process.env.NODE_ENV in client components (causes Turbopack chunk desync)",
    },
    schema: [],
    messages: {
      noNodeEnv:
        "process.env.NODE_ENV in a \"use client\" file forces Turbopack to load the process.js polyfill as a separate chunk, which desyncs ('module factory is not available') in dynamically-imported (next/dynamic ssr:false) chunks. Pass isDev as a prop from the nearest Server Component instead.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const text = sourceCode.text;
    const header = text.slice(0, 200);
    if (!/"use client"|'use client'/.test(header)) return {};
    return {
      MemberExpression(node) {
        if (
          node.object?.type === "MemberExpression" &&
          node.object.object?.type === "Identifier" &&
          node.object.object.name === "process" &&
          node.object.property?.type === "Identifier" &&
          node.object.property.name === "env" &&
          node.property?.type === "Identifier" &&
          node.property.name === "NODE_ENV"
        ) {
          context.report({ node, messageId: "noNodeEnv" });
        }
      },
    };
  },
};

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

  // ── Custom plugin registration ──────────────────────────────────
  {
    plugins: {
      nirman: {
        rules: {
          "no-process-env-node-env-in-client": noProcessEnvInClientPlugin,
        },
      },
    },
  },

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
      // React 19 compiler rules — legitimate patterns (form init, data loading
      // on mount) trigger these. Disabled because the "correct" refactor
      // (useSyncExternalStore) doesn't apply to most of these cases.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "warn",
      "nirman/no-process-env-node-env-in-client": "warn",
    },
  },

  // ── Test files — relax rules that are noisy in tests ────────────
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/display-name": "off",
    },
  },
);
