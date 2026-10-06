import { ArrowDown } from "lucide-react";

/**
 * 不在底部时出现的「回到底部」：36px 圆钮，贴着滚动区底部往上 12px（输入框上方），在阅读列的正中。
 * 它放在滚动区里、高度为 0 的 sticky 盒子里，所以和阅读列用同一个中心线，也不占内容高度。
 * 对话还在输出时，箭头换成三个依次跳动的点。
 */
export function ScrollToBottomButton({ running, onClick }: { running: boolean; onClick: () => void }) {
  return (
    <div className="pointer-events-none sticky bottom-3 z-10 flex h-0 justify-center">
      <button
        type="button"
        aria-label="回到底部"
        data-testid="scroll-to-bottom"
        data-running={running ? "true" : undefined}
        onClick={onClick}
        className="scroll-fab pointer-events-auto flex h-9 w-9 -translate-y-full items-center justify-center rounded-full shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {running ? (
          <span aria-hidden="true" data-testid="scroll-dots" className="flex items-center gap-[3px]">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
        ) : (
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
