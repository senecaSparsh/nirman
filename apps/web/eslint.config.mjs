import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**"],
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
      // on mount) trigger these. Downgrade to warnings until the patterns are
      // refactored to the compiler's preferred form.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
