import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Deliberately loose: the recommended rule sets, with rules that would need business-code rewrites left as warnings.
export default tseslint.config(
  {
    ignores: ["dist", "coverage", ".stack", "acceptance-report", "playwright-report*", "test-results*", "node_modules"],
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
    files: ["e2e/**/*.{ts,mjs}", "*.config.{ts,js}", "playwright*.ts"],
    languageOptions: { globals: globals.node },
    // Stripping ANSI escapes and matching padded report text are legitimate regexes here.
    rules: { "no-control-regex": "off", "no-regex-spaces": "off" },
  },
);
