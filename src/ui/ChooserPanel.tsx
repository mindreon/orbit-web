import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * 选择器共用的弹出面板：圆角卡片，头部放搜索（可省），中间滚动列表，底部放「完成 / 加载更多」（可省）。
 * 套在触发按钮的 relative 容器里；`className` 决定位置和宽度（往下 `mt-1`，往上 `bottom-full mb-2`）。
 */
export function ChooserPanel({
  label,
  className,
  header,
  footer,
  children,
}: {
  label: string;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div aria-label={label} className={cn("menu-in absolute z-30 flex max-h-96 w-full flex-col rounded-card bg-card shadow-lg ring-1 ring-border", className)}>
      {header ? <div className="flex flex-col gap-2 border-b border-border p-2">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}
