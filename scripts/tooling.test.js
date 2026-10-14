import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateV2Spec } from "./validate-openapi.mjs";
import { checkNotice, generateNotice } from "./notice.mjs";

// Failure modes: a v1/invalid spec overwrites API types; new dependencies, versions,
// aliases or license text are missing from NOTICE; an unknown license silently passes.
describe("OpenAPI v2 guard", () => {
  it.each([
    "openapi: 3.0.3\ninfo:\n  version: 2.0.0",
    "openapi: 3.1.0\ninfo:\n  version: 0.3.0",
    "openapi: 3.1.0\ninfo: {}",
    "openapi: 3.1.0\ninfo:\n  version: 2",
    "not: [valid",
  ])("rejects an unsupported or invalid contract", (yaml) => { expect(() => validateV2Spec(yaml)).toThrow(); });
  it("accepts OpenAPI 3.1 with a 2.x API version", () => { expect(() => validateV2Spec('openapi: 3.1.1\ninfo:\n  version: "2.0.0"')).not.toThrow(); });
});

const fixtures = [];
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.resolve("scripts/.notice-test-"));
  fixtures.push(root);
  mkdirSync(path.join(root, "node_modules", "alias"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { alias: "npm:actual@1.0.0" } }));
  writeFileSync(path.join(root, "node_modules", "alias", "package.json"), JSON.stringify({ name: "actual", version: "1.0.0", license: "MIT" }));
  writeFileSync(path.join(root, "node_modules", "alias", "LICENSE"), "Copyright Example\nMIT license text\n");
  return root;
}

describe("dependency NOTICE", () => {
  it("records installed aliases, versions, licenses and license text", () => {
    const notice = generateNotice(fixture());
    expect(notice).toContain("alias → actual@1.0.0 — MIT");
    expect(notice).toContain("Copyright Example");
    expect(notice).toContain("MIT license text");
  });
  it("rejects missing or stale NOTICE and accepts exact generated output", () => {
    const root = fixture();
    expect(() => checkNotice(root)).toThrow();
    writeFileSync(path.join(root, "NOTICE"), generateNotice(root));
    expect(() => checkNotice(root)).not.toThrow();
    writeFileSync(path.join(root, "node_modules", "alias", "LICENSE"), "Changed license");
    expect(() => checkNotice(root)).toThrow();
  });
  it("fails for dependencies without a license", () => {
    const root = fixture();
    writeFileSync(path.join(root, "node_modules", "alias", "package.json"), '{"name":"actual","version":"1.0.0"}');
    expect(() => generateNotice(root)).toThrow(/license/i);
  });
  it("keeps the repository NOTICE current with package.json", () => {
    expect(() => checkNotice(process.cwd())).not.toThrow();
    expect(readFileSync("NOTICE", "utf8")).toContain("@e965/xlsx");
  });
});
