import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { panelWidthRange } from "../../lib/panelWidth";

/** 面板宽度写在这个 CSS 变量上；拖动时直接改它，不走 React，松手才提交。 */
export const PANEL_WIDTH_VAR = "--task-panel-w";

const STEP = 8;
const STEP_SHIFT = 32;

interface PanelResizeHandleProps {
  /** 被调整的面板：拖动时直接改它的 CSS 变量。 */
  readonly panel: RefObject<HTMLElement | null>;
  /** 已提交的宽度（px）。 */
  readonly width: number;
  readonly onCommit: (width: number) => void;
  /** 拖到比最窄的一半还窄再松手：收起面板。 */
  readonly onCollapse: () => void;
}

/**
 * 面板左边缘的拖动条：12px 宽的热区，中间一根 1px 的线，悬停、聚焦和拖动时变色。
 * 拖动时每次 pointermove 只改 CSS 变量和 aria 属性；键盘 ←/→ 每次 8px（Shift 32px），Home/End 到最窄和最宽。
 */
export function PanelResizeHandle({ panel, width, onCommit, onCollapse }: PanelResizeHandleProps) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; raw: number } | null>(null);
  const { min, max } = panelWidthRange();

  const show = (px: number) => {
    panel.current?.style.setProperty(PANEL_WIDTH_VAR, `${px}px`);
    handle.current?.setAttribute("aria-valuenow", String(Math.round(px)));
  };
  const clamp = (px: number) => Math.round(Math.min(max, Math.max(min, px)));

  const finish = (commit: boolean) => {
    const state = drag.current;
    drag.current = null;
    if (!state || !handle.current) return;
    handle.current.dataset.dragging = "false";
    handle.current.dataset.collapsing = "false";
    document.body.style.userSelect = "";
    // 不管提交与否，都把变量写回最终值：React 看到的属性没变时不会再写一遍。
    if (commit && state.raw < min / 2) {
      show(width);
      onCollapse();
      return;
    }
    const next = commit ? clamp(state.raw) : width;
    show(next);
    if (next !== width) onCommit(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panel.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startWidth = panel.current.getBoundingClientRect().width;
    drag.current = { startX: event.clientX, startWidth, raw: startWidth };
    event.currentTarget.dataset.dragging = "true";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    // 面板在右边，向左拖变宽。
    state.raw = state.startWidth + (state.startX - event.clientX);
    event.currentTarget.dataset.collapsing = String(state.raw < min / 2);
    show(Math.min(max, Math.max(min / 2, state.raw)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP_SHIFT : STEP;
    const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step : event.key === "Home" ? min : event.key === "End" ? max : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = clamp(next);
    show(clamped);
    if (clamped !== width) onCommit(clamped);
  };

  return (
    <div
      ref={handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整详情宽度"
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      data-testid="panel-resize"
      className="group absolute inset-y-0 -left-1 z-10 w-3 cursor-col-resize touch-none outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1 w-px bg-transparent transition-colors group-hover:bg-primary-500 group-focus-visible:bg-primary-500 group-data-[dragging=true]:bg-primary-500 group-data-[collapsing=true]:bg-danger-500" />
    </div>
  );
}
