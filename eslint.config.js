import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import moduleBoundaries from "./eslint-rules/module-boundaries.js";
import designTokens from "./eslint-rules/design-tokens.js";

// Deliberately loose: the recommended rule sets, with rules that would need business-code rewrites left as warnings.
export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "e2e-artifacts", "test-results", "playwright-report"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { orbit: { rules: { "module-boundaries": moduleBoundaries, "design-tokens": designTokens } } },
    rules: { "orbit/module-boundaries": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/platform/queryKeys.ts"],
    rules: { "no-restricted-syntax": ["error", { selector: "Property[key.name='queryKey'] > ArrayExpression, Property[key.name='queryKey'] > TSAsExpression > ArrayExpression, Property[key.name='queryKey'] > TSSatisfiesExpression > ArrayExpression", message: "Use platform/queryKeys factories; query keys must begin with tenantId." }] },
  },
  {
    // Design tokens: no arbitrary font sizes, no opacity-built semantic colours (see eslint-rules/design-tokens.js).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts"],
    rules: { "orbit/design-tokens": "error" },
  },
  {
    files: ["*.config.{ts,js}", "scripts/**/*.{js,mjs}", "eslint-rules/**/*.js", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
);
