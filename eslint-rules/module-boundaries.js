import path from "node:path";

export const featureEdges = ["sessions>teams", "sessions>interactions", "sessions>files", "sessions>runs", "runs>teams", "runs>interactions", "assets>files", "reviews>assets", "reviews>files"];
const ranks = { lib: 0, ui: 1, api: 1, components: 2, platform: 3, features: 4, app: 5, test: 6 };
export default {
  meta: { type: "problem", schema: [], messages: { boundary: "Disallowed module dependency: {{from}} → {{to}}" } },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const root = filename.slice(0, filename.lastIndexOf("/src/") + 5);
    const from = filename.slice(root.length).split("/");
    const report = (node, target) => context.report({ node, messageId: "boundary", data: { from: from.join("/"), to: target } });
    function check(node, source, typeOnly = false) {
      if (!source || typeof source.value !== "string") return;
      const value = source.value;
      if (value.startsWith("@radix-ui/") && from[0] !== "ui") return report(node, value);
      if ((value === "react" || value.startsWith("react/")) && ["lib", "api"].includes(from[0])) return report(node, value);
      if (!value.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(filename), value).replaceAll("\\", "/");
      if (!resolved.startsWith(root)) return;
      const target = resolved.slice(root.length).replace(/\.(tsx?|jsx?)$/, "").split("/");
      const [layer, feature] = from;
      const [other, otherFeature] = target;
      if (other === "test" && /\.test\.[tj]sx?$/.test(filename)) return;
      if (!(layer in ranks) || !(other in ranks)) return;
      if (target.slice(0, 3).join("/") === "platform/identity/control" && from.slice(0, 3).join("/") !== "platform/identity/control" && from.join("/") !== "platform/identity/index.ts") return report(node, value);
      if (layer === "features" && target.join("/") === "platform/client" && !typeOnly && node.specifiers?.some((item) => (item.imported ?? item.local)?.name !== "api")) return report(node, value);
      if (from.slice(0, 3).join("/") === "features/interactions/inbox" && from.at(-1) !== "inboxSource.ts") {
        if (target.join("/") === "platform/client" || other === "api" && !typeOnly) return report(node, value);
        if (other === "features" && otherFeature === "interactions" && target[2] !== "inbox" && !typeOnly) return report(node, value);
      }
      if (layer === "ui" && !["ui", "lib"].includes(other)) return report(node, value);
      if (layer === "api" && !["api", "lib"].includes(other)) return report(node, value);
      if (layer === "components" && other === "api") { if (!typeOnly) report(node, value); return; }
      if (ranks[other] > ranks[layer]) return report(node, value);
      if (other === "features" && layer !== "features" && target.length !== 2 && !(target.length === 3 && target[2] === "index")) return report(node, value);
      if (layer === "features" && other === "features" && feature !== otherFeature && (!featureEdges.includes(`${feature}>${otherFeature}`) || !(target.length === 2 || target.length === 3 && target[2] === "index"))) return report(node, value);
    }
    return {
      ImportDeclaration: (node) => check(node, node.source, node.importKind === "type" || node.specifiers.length > 0 && node.specifiers.every((item) => item.importKind === "type")),
      ExportNamedDeclaration: (node) => check(node, node.source, node.exportKind === "type"),
      ExportAllDeclaration: (node) => check(node, node.source, node.exportKind === "type"),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};
