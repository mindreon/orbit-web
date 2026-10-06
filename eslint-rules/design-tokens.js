/**
 * Keeps class names inside the design system (src/index.css, docs/design-system.md):
 *   - font sizes come from the six named tokens, never `text-[13px]` or a retired Tailwind size (`text-sm`);
 *   - a shade is a ramp step (`bg-primary-100`), never opacity on a semantic colour (`bg-primary/10`);
 *   - semantic text uses the 700 step (`text-danger-700`), not the bare colour (`text-destructive`);
 *   - weights are 400/500/600, radii are control / card / bubble (the message bubble and the composer only) / full.
 * Legitimate exceptions get `// eslint-disable-next-line orbit/design-tokens -- why` right above the line.
 */
const SEMANTIC = "primary|secondary|accent|muted|destructive|success|warning|danger|foreground|card|background|gray|sidebar|border|input|ring";
const AFTER = "(?![\\w-])";
const BEFORE = "(?<![\\w-])";

const RULES = [
  [new RegExp(`${BEFORE}text-\\[[0-9.]+(?:px|rem|em|pt)\\]`), "Arbitrary font size. Use text-caption (12), text-small (13), text-body (14), text-title (16), text-heading (20) or text-display (24)."],
  [new RegExp(`${BEFORE}text-(?:xs|sm|base|lg|xl|[2-9]xl)${AFTER}`), "Retired font-size class. Use text-caption, text-small, text-body, text-title, text-heading or text-display."],
  [
    new RegExp(`${BEFORE}(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|placeholder|shadow)-(?:${SEMANTIC})(?:-[a-z0-9]+)*\\/\\d+`),
    "Shade built with opacity on a semantic colour. Use a ramp step (bg-primary-100, text-gray-700, border-danger-200).",
  ],
  [new RegExp(`${BEFORE}text-(?:primary|success|warning|destructive|danger)${AFTER}`), "Bare semantic text colour. Text uses the 700 step (text-primary-700, text-danger-700)."],
  [new RegExp(`${BEFORE}font-(?:thin|extralight|light|bold|extrabold|black)${AFTER}`), "Only font-normal (400), font-medium (500) and font-semibold (600) exist."],
  [new RegExp(`${BEFORE}rounded(?:-[trbl]{1,2})?-(?:sm|md|lg|xl|2xl|3xl)${AFTER}`), "Retired radius. Use rounded-control (8px), rounded-card (12px), rounded-bubble (20px, message bubbles and the composer) or rounded-full."],
  [new RegExp(`${BEFORE}rounded(?:-[trbl]{1,2})?-\\[`), "Arbitrary radius. Use rounded-control (8px), rounded-card (12px), rounded-bubble (20px, message bubbles and the composer) or rounded-full."],
  [new RegExp(`${BEFORE}rounded${AFTER}`), "Bare rounded is not in the scale. Use rounded-control (8px), rounded-card (12px), rounded-bubble (20px, message bubbles and the composer) or rounded-full."],
];

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: { type: "problem", schema: [], messages: { token: "{{message}} (`{{match}}`)" } },
  create(context) {
    const check = (node, text) => {
      for (const [pattern, message] of RULES) {
        const found = pattern.exec(text);
        if (found) context.report({ node, messageId: "token", data: { message, match: found[0] } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
