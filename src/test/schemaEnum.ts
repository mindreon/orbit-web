import { readFileSync } from "node:fs";
import ts from "typescript";

/** Read generated unions, not a second manually maintained list of protocol values. */
export function schemaEnum(name: string, ...properties: string[]): string[] {
  const file = ts.createSourceFile("schema.d.ts", readFileSync(new URL("../api/schema.d.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const components = file.statements.find((node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node) && node.name.text === "components")!;
  let members: ts.NodeArray<ts.TypeElement> = components.members;
  let type: ts.TypeNode | undefined;
  for (const key of ["schemas", name, ...properties]) {
    const member = members.find((node): node is ts.PropertySignature => ts.isPropertySignature(node) && node.name.getText(file).replaceAll('"', "") === key);
    type = member?.type;
    if (type && ts.isTypeLiteralNode(type)) members = type.members;
  }
  const values: string[] = [];
  function visit(node: ts.Node) { if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) values.push(node.literal.text); else ts.forEachChild(node, visit); }
  if (!type) throw new Error(`Missing schema enum ${name}.${properties.join(".")}`);
  visit(type);
  return values.sort();
}
