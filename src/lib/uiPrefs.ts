/** 通用设置里会立刻作用到界面上的几项。写进 localStorage，刷新后保持。 */

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
  /** 开发者模式：任务页右侧多出计划图、执行记录、事件日志等调试信息。 */
  developer: boolean;
};

const DEFAULTS: Prefs = { fontSize: "默认", compact: false, tipSound: "灵动", linkOpen: "按需（默认）", clientNotice: true, theme: "浅色", tone: "默认", welcome: true, fileChanges: true, customPrompt: "", developer: false };

const STORAGE_KEY = "orbit.uiPrefs";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    // 只接受枚举值合法的键，坏数据回默认。
    const fontSize = FONT_ORDER.includes(saved.fontSize as FontSize) ? (saved.fontSize as FontSize) : DEFAULTS.fontSize;
    const theme = saved.theme === "深色" ? "深色" : saved.theme === "浅色" ? "浅色" : DEFAULTS.theme;
    return { ...DEFAULTS, ...saved, fontSize, theme };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<() => void>();
let prefs: Prefs = load();

export function getUiPrefs() {
  return prefs;
}

export function setUiPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等存不进去就算了，本次会话内仍然生效。
  }
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
