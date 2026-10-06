/** 任务页右侧详情面板的宽度：默认 26rem，最窄 20rem，最宽 60rem 或屏宽的 70%。拖动调整，记在 localStorage。 */

const WIDTH_KEY = "orbit.taskPanelWidth";

const rem = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** 当前窗口下能调到的范围（px）；rem 跟着字号偏好走。 */
export function panelWidthRange(): { readonly min: number; readonly max: number } {
  const unit = rem();
  const min = 20 * unit;
  return { min, max: Math.max(min, Math.min(60 * unit, window.innerWidth * 0.7)) };
}

/** 没拖过时的宽度：26rem；不到 1280px 的屏窄一点，22rem，给对话多留地方。 */
export function defaultPanelWidth(): number {
  return (window.innerWidth < 1280 ? 22 : 26) * rem();
}

export function clampPanelWidth(width: number): number {
  const { min, max } = panelWidthRange();
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** 上次拖出来的宽度（px）；没记过或存储不可用时返回 null，面板用默认宽度。 */
export function readPanelWidth(): number | null {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value > 0 ? clampPanelWidth(value) : null;
  } catch {
    return null;
  }
}

export function writePanelWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
  } catch {
    // 存不进去就算了，本次会话内仍然生效。
  }
}
