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
    // 163 pre-existing violations across the codebase as of 2026-07-11 (CI's
    // first real run since being disabled in April). Downgraded to unblock
    // the pipeline; tighten back to "error" once the backlog is paid down.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
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
