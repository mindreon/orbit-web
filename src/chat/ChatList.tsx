import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Approval } from "../lib/rooms";
import type { TimelineItem } from "../lib/events/timeline";
import { ChatItem } from "./ChatItem";
import { useFrameVirtualizer } from "./useFrameVirtualizer";

/** Within this many pixels of the bottom the list counts as "at the latest" and keeps following new content. */
const PIN_THRESHOLD = 80;
/** After the reader's own wheel input, auto-follow waits this long so it does not fight the gesture. */
const GESTURE_MS = 300;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function ChatList({
  items,
  footer,
  empty,
  highlight,
  focusId,
  retryDisabled,
  onRetry,
  approvals,
  decideDisabled,
  onDecide,
}: {
  items: TimelineItem[];
  footer: ReactNode;
  empty: ReactNode;
  highlight: string;
  focusId: string | null;
  retryDisabled: boolean;
  onRetry: (text: string) => void;
  approvals: readonly Approval[];
  decideDisabled: boolean;
  onDecide: (approvalId: string, decision: "allow" | "reject") => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);
  /** items.length when the reader last saw the bottom; anything past it counts as new. */
  const seenCount = useRef(items.length);

  const virtualizer = useFrameVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    gap: 16,
    paddingStart: 16,
    getItemKey: (index) => items[index]?.id ?? index,
  });
  // The virtualizer shifts scrollTop when an item above the fold changes height. While following the latest
  // content that shift reads as "the reader scrolled up" and unpins the list; the pin already keeps the bottom in view.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    !pinnedRef.current && item.start < (instance.scrollOffset ?? 0);

  const setPin = useCallback((next: boolean) => {
    if (pinnedRef.current === next) return;
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  if (pinned) seenCount.current = items.length;
  const unseen = pinned ? 0 : Math.max(0, items.length - seenCount.current);

  /** Non-null while 「回到最新」 animates; the animation owns scrollTop until it lands. */
  const smoothRef = useRef<number | null>(null);
  const gestureUntil = useRef(0);
  const followLater = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const cancelSmooth = useCallback(() => {
    if (smoothRef.current !== null) cancelAnimationFrame(smoothRef.current);
    smoothRef.current = null;
  }, []);

  /** Eases to the bottom, re-aiming every frame because rows measured on the way change the total height. */
  const smoothToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    cancelSmooth();
    // From far up, skip most of the distance so the visible part of the animation stays short.
    const far = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (far > el.clientHeight * 3) el.scrollTop = el.scrollHeight - el.clientHeight * 3;
    const from = el.scrollTop;
    const started = performance.now();
    const duration = 360;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const target = el.scrollHeight - el.clientHeight;
      el.scrollTop = from + (target - from) * easeOutCubic(t);
      if (t < 1) smoothRef.current = requestAnimationFrame(step);
      else {
        smoothRef.current = null;
        toBottom();
      }
    };
    smoothRef.current = requestAnimationFrame(step);
  }, [cancelSmooth, toBottom]);

  const totalSize = virtualizer.getTotalSize();

  // `footer` is a new node on every render, so this runs after each render; scrolling to the bottom is idempotent.
  // No state is set here: a setState in a layout effect would cost a second commit in the same frame.
  useLayoutEffect(() => {
    if (!pinnedRef.current || smoothRef.current !== null) return;
    const wait = gestureUntil.current - performance.now();
    if (wait <= 0) {
      toBottom();
      return;
    }
    if (followLater.current === null) {
      followLater.current = setTimeout(() => {
        followLater.current = null;
        if (pinnedRef.current && smoothRef.current === null) toBottom();
      }, wait);
    }
  }, [totalSize, items.length, footer, toBottom]);

  useEffect(
    () => () => {
      cancelSmooth();
      if (followLater.current !== null) clearTimeout(followLater.current);
    },
    [cancelSmooth],
  );

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
    if (!el || smoothRef.current !== null) return;
    setPin(el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD);
  };

  const jump = () => {
    setPin(true);
    seenCount.current = items.length;
    smoothToBottom();
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
          if (event.deltaY >= 0) return;
          cancelSmooth();
          gestureUntil.current = performance.now() + GESTURE_MS;
        }}
        onTouchMove={() => {
          cancelSmooth();
          gestureUntil.current = performance.now() + GESTURE_MS;
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
                    approvals={approvals}
                    decideDisabled={decideDisabled}
                    onDecide={onDecide}
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
