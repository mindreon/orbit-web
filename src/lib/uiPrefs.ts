/** 通用设置里会立刻作用到界面上的几项。刷新后回到默认。 */

export type FontSize = "小" | "默认" | "大";
export type TipSound = "灵动" | "晴朗" | "沉稳" | "无音效";
export type LinkOpen = "按需（默认）" | "始终内置" | "始终外部";

const FONT_ORDER: FontSize[] = ["小", "默认", "大"];

export type ThemeName = "浅色" | "深色";

type Prefs = {
  fontSize: FontSize;
  compact: boolean;
  tipSound: TipSound;
  linkOpen: LinkOpen;
  clientNotice: boolean;
  theme: ThemeName;
  tone: string;
  welcome: boolean;
  fileChanges: boolean;
  customPrompt: string;
};

const listeners = new Set<() => void>();
let prefs: Prefs = { fontSize: "默认", compact: false, tipSound: "灵动", linkOpen: "按需（默认）", clientNotice: true, theme: "浅色", tone: "默认", welcome: true, fileChanges: true, customPrompt: "" };

export function getUiPrefs() {
  return prefs;
}

export function setUiPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeUiPrefs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fontSizePx(size: FontSize) {
  if (size === "小") return "14px";
  if (size === "大") return "18px";
  return "16px";
}

/** dir 为 1 放大，-1 缩小，0 回到默认。已经到头就停在那一档。 */
export function stepFontSize(dir: -1 | 0 | 1) {
  if (dir === 0) {
    setUiPrefs({ fontSize: "默认" });
    return;
  }
  const index = FONT_ORDER.indexOf(prefs.fontSize);
  const next = FONT_ORDER[Math.min(FONT_ORDER.length - 1, Math.max(0, index + dir))];
  setUiPrefs({ fontSize: next });
}
