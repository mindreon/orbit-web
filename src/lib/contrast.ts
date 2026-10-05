/** WCAG 2.x contrast from the HSL triplets in src/index.css, so a token edit that breaks legibility fails a unit test. */

export type Theme = "light" | "dark";

/** `219 80% 50%` -> [219, 0.8, 0.5] */
export function parseTriplet(value: string): [number, number, number] {
  const match = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(value);
  if (!match) throw new Error(`not an HSL triplet: ${value}`);
  return [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
}

export function hslToRgb([h, s, l]: readonly [number, number, number]): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

export function luminance(triplet: string): number {
  const [r, g, b] = hslToRgb(parseTriplet(triplet)).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function blockVars(css: string, selector: RegExp): Record<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error(`no block for ${selector}`);
  const start = css.indexOf("{", match.index) + 1;
  const end = css.indexOf("\n}", start);
  const vars: Record<string, string> = {};
  for (const line of css.slice(start, end).split("\n")) {
    const declaration = /^\s*(--[\w-]+):\s*([^;]+);/.exec(line);
    if (declaration) vars[declaration[1]] = declaration[2].trim();
  }
  return vars;
}

/** Every custom property of a theme with `var(--x)` aliases resolved. Dark inherits what it does not redefine. */
export function resolveTokens(css: string, theme: Theme): Record<string, string> {
  const light = blockVars(css, /:root,\s*:host\s*\{/);
  const raw = theme === "dark" ? { ...light, ...blockVars(css, /html\[data-theme="dark"\]\s*\{/) } : light;
  const resolve = (name: string, depth = 0): string => {
    const value = raw[name];
    if (value === undefined) throw new Error(`unknown token ${name}`);
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (alias && depth < 8) return resolve(alias[1], depth + 1);
    return value;
  };
  return Object.fromEntries(Object.keys(raw).map((name) => [name, resolve(name)]));
}
