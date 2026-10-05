import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../eslint-rules/design-tokens.js";

/**
 * Ways the design lint can fail, each asserted below:
 *   L1 an arbitrary font size (`text-[13px]`) or a retired one (`text-sm`) gets through
 *   L2 a shade built with opacity (`bg-primary/10`, `hover:text-foreground/80`) gets through
 *   L3 the rule flags legitimate classes (`bg-black/40`, `text-primary-foreground`, `text-body`, `hover:bg-primary-hover`)
 *   L4 the allow-list comment does not silence a deliberate exception
 */

function lint(source: string) {
  const linter = new Linter();
  return linter.verify(source, [{ files: ["**/*.tsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { orbit: { rules: { "design-tokens": rule } } }, rules: { "orbit/design-tokens": "error" } }], "sample.tsx");
}
const bad = (classes: string) => lint(`export const a = <div className="${classes}" />;`);

describe("orbit/design-tokens", () => {
  it.each(["text-[13px]", "md:text-[14px]", "text-[0.8rem]", "text-sm", "hover:text-xs", "text-3xl", "text-base"])("rejects the font size %s (L1)", (classes) => {
    expect(bad(classes).map((m) => m.ruleId)).toContain("orbit/design-tokens");
  });

  it.each(["bg-primary/10", "hover:bg-primary/90", "text-foreground/80", "border-warning/30", "bg-muted/60", "ring-primary/30", "bg-gray-100/50"])("rejects the opacity-built colour %s (L2)", (classes) => {
    expect(bad(classes).map((m) => m.ruleId)).toContain("orbit/design-tokens");
  });

  it.each(["text-destructive", "text-primary", "font-bold", "rounded-lg", "rounded-2xl", "rounded", "rounded-[12px]", "rounded-tr-md"])("rejects the off-scale class %s", (classes) => {
    expect(bad(classes).length).toBeGreaterThan(0);
  });

  it("checks template literals and class helpers as well", () => {
    expect(lint("export const a = cn(`flex text-[11px] ${x}`, cond && 'bg-success/10');").length).toBe(2);
  });

  it("accepts the design system's own classes (L3)", () => {
    const fine = "bg-black/40 text-primary-foreground text-body text-caption text-small text-title text-heading text-display bg-primary-hover bg-primary-100 text-primary-700 text-danger-700 text-gray-700 rounded-control rounded-card rounded-full rounded-t-card font-medium font-semibold font-normal md:text-heading max-w-[calc(100vw-2rem)] h-[132px] min-h-[3.5rem] w-1/2 bg-neutral-100/50 bg-blue-500/15";
    expect(bad(fine)).toEqual([]);
  });

  it("can be silenced with a comment that says why (L4)", () => {
    const source = `// eslint-disable-next-line orbit/design-tokens -- preview swatch of the other theme\nexport const a = <div className="bg-primary/10" />;`;
    expect(lint(source)).toEqual([]);
  });
});
