import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.js", "sentry.server.config.ts", "translate-af.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // 2026-07-11: the pre-existing 163-instance any-typing backlog (first
      // real CI run since being disabled in April) is fully paid down —
      // back to error so it can't silently regrow.
      "@typescript-eslint/no-explicit-any": "error",
      // Intentionally-unused bindings prefixed with `_` (destructuring
      // placeholders, ignored catch params) shouldn't warn.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
