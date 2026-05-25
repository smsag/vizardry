import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Catch unhandled promises — most valuable rule for async-heavy UI code
      "@typescript-eslint/no-floating-promises": "error",

      // Prefer `import type` for type-only imports (helps bundlers tree-shake)
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],

      // Strict equality everywhere
      "eqeqeq": ["error", "always"],

      // Allow console.error/warn (used for plugin error reporting), ban console.log
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
];
