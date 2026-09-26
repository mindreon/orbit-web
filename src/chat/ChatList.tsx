import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import type { TimelineItem } from "../lib/events/timeline";
import { ChatItem } from "./ChatItem";

/** Within this many pixels of the bottom the list counts as "at the latest" and keeps following new content. */
const PIN_THRESHOLD = 64;

export function ChatList({
  items,
  footer,
  empty,
  highlight,
  focusId,
  retryDisabled,
  onRetry,
}: {
  items: TimelineItem[];
  footer: ReactNode;
  empty: ReactNode;
  highlight: string;
  focusId: string | null;
  retryDisabled: boolean;
  onRetry: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const seenCount = useRef(items.length);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    gap: 16,
    paddingStart: 16,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  const setPin = useCallback((next: boolean) => {
    if (pinnedRef.current === next) return;
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  const toBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const totalSize = virtualizer.getTotalSize();

  // `footer` is a new node on every render, so this runs after each render; scrolling to the bottom is idempotent.
  useLayoutEffect(() => {
    if (pinnedRef.current) {
      toBottom();
      seenCount.current = items.length;
      setUnseen(0);
    } else if (items.length > seenCount.current) {
      setUnseen(items.length - seenCount.current);
    }
  }, [totalSize, items.length, footer, toBottom]);

  useEffect(() => {
    if (!focusId) return;
    const index = items.findIndex((item) => item.id === focusId);
    if (index < 0) return;
    setPin(false);
    virtualizer.scrollToIndex(index, { align: "center" });
    // `items` is read for the index only; re-running on every stream update would fight the reader's scrolling.
  }, [focusId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPin(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD);
  };

  const jump = () => {
    setPin(true);
    seenCount.current = items.length;
    setUnseen(0);
    if (items.length > 0) virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    requestAnimationFrame(toBottom);
  };

  const needle = highlight.trim();

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="chat-scroll"
        className="h-full overflow-y-auto px-4"
        onScroll={onScroll}
        onWheel={(event) => {
          if (event.deltaY < 0) setPin(false);
        }}
      >
        {items.length === 0 ? empty : null}
        <div className="relative w-full" style={{ height: totalSize }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = items[row.index];
            const text = "text" in item ? item.text : "";
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <div className="mx-auto max-w-3xl">
                  <ChatItem
                    item={item}
                    highlight={needle && text.includes(needle) ? needle : ""}
                    focused={item.id === focusId}
                    retryDisabled={retryDisabled}
                    onRetry={onRetry}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mx-auto max-w-3xl space-y-3 pb-4 pt-3">{footer}</div>
      </div>
      {!pinned ? (
        <button
          type="button"
          data-testid="jump-latest"
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-white px-3 py-1.5 text-xs text-[#333] shadow-md hover:bg-[#f6f6f7]"
          onClick={jump}
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          {unseen > 0 ? `有 ${unseen} 条新内容 · 回到最新` : "回到最新"}
        </button>
      ) : null}
    </div>
  );
}
