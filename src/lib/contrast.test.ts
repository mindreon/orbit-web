import { describe, expect, it } from "vitest";
import config from "../../tailwind.config";
import { contrastRatio, resolveTokens, type Theme } from "./contrast";

// The tokens are read from the stylesheet itself so the test cannot drift from what ships. (No @types/node here, hence the loose import.)
const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync(path: URL, encoding: "utf8"): string };
const css = fs.readFileSync(new URL("../index.css", import.meta.url), "utf8");

/**
 * Ways the colour tokens can fail, each asserted below:
 *   C1 status badge / alert / attention text is under 4.5:1 on its tinted surface (12px text needs AA)
 *   C2 the primary or danger button's label is under 4.5:1 on its fill
 *   C3 muted text is under 4.5:1 on the surfaces it sits on
 *   C4 the type scale, weights and radii drift from the documented system
 *   C5 a ramp step is missing in one theme
 */

const AA = 4.5;
const THEMES: readonly Theme[] = ["light", "dark"];
const TONES = ["primary", "success", "warning", "danger"] as const;

type Row = { theme: Theme; pair: string; foreground: string; background: string; ratio: number };
const rows: Row[] = [];
function check(theme: Theme, pair: string, tokens: Record<string, string>, fg: string, bg: string): number {
  const ratio = contrastRatio(tokens[fg], tokens[bg]);
  rows.push({ theme, pair, foreground: fg, background: bg, ratio: Math.round(ratio * 100) / 100 });
  return ratio;
}

describe.each(THEMES)("%s theme contrast", (theme) => {
  const tokens = resolveTokens(css, theme);

  it.each(TONES)("%s: 700 text on the 50 and 100 surfaces (badge, alert, attention) (C1)", (tone) => {
    for (const step of [50, 100]) {
      expect(check(theme, `${tone} badge/alert`, tokens, `--${tone}-700`, `--${tone}-${step}`), `${tone}-700 on ${tone}-${step}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("text and titles on the attention surfaces, and 700 text on the plain page surfaces (C1)", () => {
    for (const tone of TONES) {
      expect(check(theme, `${tone} title on attention`, tokens, "--foreground", `--${tone}-50`)).toBeGreaterThanOrEqual(AA);
      expect(check(theme, `${tone} body on attention`, tokens, "--gray-700", `--${tone}-50`)).toBeGreaterThanOrEqual(AA);
      expect(check(theme, `${tone} link/text on card`, tokens, `--${tone}-700`, "--card")).toBeGreaterThanOrEqual(AA);
    }
  });

  it("neutral badge text on gray-100 (C1)", () => {
    expect(check(theme, "neutral badge", tokens, "--gray-700", "--gray-100")).toBeGreaterThanOrEqual(AA);
  });

  it("the primary and danger buttons keep a readable label, and their hover step too (C2)", () => {
    expect(check(theme, "primary button", tokens, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(AA);
    expect(check(theme, "primary button hover", tokens, "--primary-foreground", "--primary-hover")).toBeGreaterThanOrEqual(AA);
    expect(check(theme, "destructive fill", tokens, "--destructive-foreground", "--destructive")).toBeGreaterThanOrEqual(AA);
  });

  it("muted text on card, page, sidebar and chip surfaces (C3)", () => {
    for (const surface of ["--card", "--muted", "--sidebar-background", "--secondary"]) {
      expect(check(theme, "muted text", tokens, "--muted-foreground", surface), surface).toBeGreaterThanOrEqual(AA);
    }
    expect(check(theme, "active nav", tokens, "--primary-700", "--sidebar-accent")).toBeGreaterThanOrEqual(AA);
    expect(check(theme, "sidebar quiet item", tokens, "--gray-500", "--sidebar-background")).toBeGreaterThanOrEqual(AA);
    expect(check(theme, "foreground", tokens, "--foreground", "--card")).toBeGreaterThanOrEqual(AA);
  });

  it("has the gray ramp 50-900 and the status ramps (C5)", () => {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) expect(tokens[`--gray-${step}`], `gray-${step}`).toBeDefined();
    for (const tone of TONES) for (const step of [50, 100, 200, 500, 600, 700]) expect(tokens[`--${tone}-${step}`], `${tone}-${step}`).toBeDefined();
  });
});

describe("type scale, weights and radii (C4)", () => {
  it("is exactly 12/13/14/16/20/24", () => {
    const tokens = resolveTokens(css, "light");
    const px = (name: string) => Number.parseFloat(tokens[name]) * 16;
    expect(["--text-caption", "--text-small", "--text-body", "--text-title", "--text-heading", "--text-display"].map(px)).toEqual([12, 13, 14, 16, 20, 24]);
    const sizes = config.theme?.fontSize as Record<string, unknown>;
    expect(Object.keys(sizes)).toEqual(["caption", "small", "body", "title", "heading", "display"]);
    expect(config.theme?.fontWeight).toEqual({ normal: "400", medium: "500", semibold: "600" });
    expect(Object.keys(config.theme?.borderRadius as object)).toEqual(["none", "control", "card", "full"]);
    expect(Number.parseFloat(tokens["--radius-control"]) * 16).toBe(8);
    expect(Number.parseFloat(tokens["--radius-card"]) * 16).toBe(12);
  });
});

// `VITE_CONTRAST_TABLE=1 pnpm vitest run src/lib/contrast.test.ts` prints every measured pair.
if (import.meta.env.VITE_CONTRAST_TABLE) {
  it("prints the contrast table", () => {
    const lines = rows.map((row) => `${row.theme.padEnd(5)} ${row.pair.padEnd(28)} ${row.foreground.padEnd(22)} on ${row.background.padEnd(22)} ${row.ratio.toFixed(2)}`);
    console.info(`\n${[...new Set(lines)].join("\n")}\n`);
  });
}
