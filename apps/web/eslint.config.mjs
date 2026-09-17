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

// ── Custom plugin: no-raw-employee-row-response ────────────────
// Flags `json(<var>)` / `NextResponse.json(<var>)` in API route files where
// <var> was assigned from a `prisma.employee.<read>` / `tx.employee.<read>`
// call — i.e. returning a raw Prisma Employee row. The model carries bank,
// gov-ID, wage, and contract-signing token columns; raw returns bypass the
// field-visibility policy in lib/employee-visibility.ts. Warns so the
// author can serialize intentionally via pickEmployeeRoster /
// redactEmployeeRow (or narrow the select).
const noRawEmployeeRowPlugin = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow returning raw Prisma Employee rows via json() (bypasses field-visibility policy)",
    },
    schema: [],
    messages: {
      rawEmployeeRow:
        "Raw Prisma Employee row returned to the client — Employee carries bank/gov-ID/wage/token columns. Serialize via pickEmployeeRoster()/redactEmployeeRow() from @/lib/employee-visibility, or narrow the select.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!/app[\\/]api[\\/].*route\.tsx?$/.test(filename)) return {};

    // Vars bound to a prisma.employee.<method> / tx.employee.<method> result.
    const employeeRowVars = new Set();

    // Detect `*.employee.<method>(...)` — callee is MemberExpression whose
    // object is a MemberExpression ending in `.employee`.
    function isEmployeeCall(call) {
      const callee = call.callee;
      if (callee?.type !== "MemberExpression") return false;
      const obj = callee.object;
      return obj?.type === "MemberExpression" && obj.property?.name === "employee";
    }

    return {
      VariableDeclarator(node) {
        const init = node.init;
        const call =
          init?.type === "AwaitExpression" ? init.argument : init;
        if (
          node.id?.type === "Identifier" &&
          call?.type === "CallExpression" &&
          isEmployeeCall(call)
        ) {
          employeeRowVars.add(node.id.name);
        }
      },
      CallExpression(node) {
        // json(<ident>) / NextResponse.json(<ident>)
        const isJson =
          (node.callee?.type === "Identifier" && node.callee.name === "json") ||
          (node.callee?.type === "MemberExpression" &&
            node.callee.property?.name === "json");
        if (!isJson) return;
        const arg = node.arguments?.[0];
        if (arg?.type === "Identifier" && employeeRowVars.has(arg.name)) {
          context.report({ node: arg, messageId: "rawEmployeeRow" });
        }
      },
    };
  },
};

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Ignore build output, deps, and root-level config files that aren't
    // part of the app source. Without this, lint-staged running eslint on
    // next.config.ts produces a "file ignored" warning that fails the
    // --max-warnings=0 gate.
    ignores: [
      ".next/**",
      "node_modules/**",
      "next.config.ts",
      "next.config.mjs",
      "next.config.js",
      "postcss.config.mjs",
      "tailwind.config.ts",
      "sentry.server.config.ts",
      "sentry.client.config.ts",
      "sentry.edge.config.ts",
    ],
  },
  {
    plugins: {
      nirman: {
        rules: {
          "no-process-env-node-env-in-client": noProcessEnvInClientPlugin,
          "no-raw-employee-row-response": noRawEmployeeRowPlugin,
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
      // Prevent returning raw Prisma Employee rows from API routes — bypasses
      // the field-visibility policy (lib/employee-visibility.ts).
      "nirman/no-raw-employee-row-response": "warn",
      // This rule is for the Pages Router — this app uses the App Router
      // exclusively (no /pages directory). Without disabling it, every lint
      // run prints "Pages directory cannot be found at .../pages or .../src/pages".
      "@next/next/no-html-link-for-pages": "off",
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
