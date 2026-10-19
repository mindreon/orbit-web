import { ESLint, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import config from "../eslint.config.js";

RuleTester.describe = describe;
RuleTester.it = it;
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
const file = "src/platform/tenancy/WorkspaceProvider.tsx";
const restrictions = (await eslint.calculateConfigForFile(file)).rules["no-restricted-syntax"];
it("enforces query key factories throughout src except the factory module", async () => {
  expect(restrictions?.[0]).toBe(2);
  const factories = await eslint.calculateConfigForFile("src/platform/queryKeys.ts");
  expect(factories.rules["no-restricted-syntax"]?.[0] ?? 0).toBe(0);
});
// Use the actual configured selectors, so tests cannot pass with a duplicate policy.
const featureRestrictions = (await eslint.calculateConfigForFile("src/features/sessions/Page.tsx")).rules["no-restricted-syntax"];
new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" } }).run("query-key-factories", builtinRules.get("no-restricted-syntax"), {
  valid: [{ code: 'useQuery({ queryKey: qk.me(tenant) })', options: featureRestrictions.slice(1) }],
  invalid: [
    'useQuery({ queryKey: [tenant, "me"] as const })',
    'useQuery({ queryKey: [tenant, "me"] satisfies readonly string[] })',
  ].map((code) => ({ code, options: featureRestrictions.slice(1), errors: [{ message: "Use platform/queryKeys factories; query keys must begin with tenantId." }] })),
});
