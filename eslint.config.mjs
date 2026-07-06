// Flat ESLint config shared across the whole monorepo (ESLint 9).
// Run from the repo root with `pnpm lint`. ESLint searches upward for this
// file, so per-package `eslint .` invocations resolve it too.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      // Vendored reference repos (git-ignored study copies, not our code).
      "**/.reference/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/.turbo/**",
      "**/.venv/**",
      "**/public/**",
      "**/next-env.d.ts",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/*.config.mjs",
      "**/postcss.config.*",
      "**/tailwind.config.*",
      "**/*.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
