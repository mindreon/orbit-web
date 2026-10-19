import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

// @ts-expect-error The lint policy is an ESM JavaScript module, shared directly with this test.
import { featureEdges } from "../../eslint-rules/module-boundaries.js";
it("U12 actual feature imports are a subset of the nine allowed edges until WP9i", () => {
  const root = path.resolve("src/features");
  const edges = new Set<string>();
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const from = path.relative(root, file).split(path.sep)[0];
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        let literal: ts.Expression | undefined;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) literal = node.arguments[0];
        if (literal && ts.isStringLiteral(literal) && literal.text.startsWith(".")) {
          const target = path.resolve(path.dirname(file), literal.text);
          if (target.startsWith(root + path.sep)) {
            const to = path.relative(root, target).split(path.sep)[0];
            if (from !== to) edges.add(`${from}>${to}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(root);
  expect([...edges].filter((edge) => !featureEdges.includes(edge))).toEqual([]);
  expect([...edges].some((edge) => edge.startsWith("catalog>"))).toBe(false);
  // Allowed-edge equality is intentionally deferred until WP9i (lead ruling).
});
