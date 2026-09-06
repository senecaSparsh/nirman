import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ── Custom plugin: no-process-env-node-env-in-client ─────────────
// Flags `process.env.NODE_ENV` references ONLY in files that start with
// the `"use client"` directive. In such files (especially dynamically-
// imported ones via next/dynamic ssr:false), Turbopack includes the
// process.js polyfill as a separate chunk which desyncs on recompile
// ("module factory is not available"). Server Components, API routes,
// and middleware are safe — they run on the server where process.env is
// natively available and inlined by the server bundler.
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
    // Only apply to files with a "use client" directive at the top
    // (within the first 50 chars — allows for whitespace/comments).
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

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    plugins: {
      nirman: {
        rules: {
          "no-process-env-node-env-in-client": noProcessEnvInClientPlugin,
        },
      },
    },
  },
  {
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
      // instead for a consistent, accessible, styled UX.
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message: "Use the useConfirm hook from @/lib/use-confirm instead of native confirm().",
        },
        {
          name: "alert",
          message: "Use toast from sonner instead of native alert().",
        },
        {
          name: "prompt",
          message: "Use a Dialog with an input field instead of native prompt().",
        },
      ],
      // React 19 compiler rules — legitimate patterns (form init, data loading
      // on mount) trigger these. Disabled because the "correct" refactor
      // (useSyncExternalStore) doesn't apply to most of these cases (fetching
      // data on mount, initializing from localStorage, resetting form state
      // when a dialog opens). These are intentional, well-understood patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "warn",
      // Prevent process.env.NODE_ENV in client components — causes Turbopack
      // chunk desync in dynamically-imported (next/dynamic ssr:false) chunks.
      // Only fires in files with a "use client" directive.
      "nirman/no-process-env-node-env-in-client": "warn",
    },
  },
  // Test files — relax rules that are noisy in tests (any types for mock
  // data, unused test helpers imported for convenience, React display names
  // on anonymous test components).
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/display-name": "off",
    },
  },
];

export default eslintConfig;
