import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** 离底部不超过这么多像素，就算在底部。 */
export const BOTTOM_THRESHOLD_PX = 24;

const distanceFromBottom = (el: HTMLElement) => Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);

export const prefersReducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/**
 * 对话滚动区的跟随：内容变长（流式文字、活动行展开、图片加载、输入框上方的卡片变高）时一直贴着底部；
 * 只有你往上滚才停，回到离底部 24px 以内（或按「回到底部」）再继续。内容长高和程序自己的滚动抢跑时，不当成你往上滚。
 * 滚动区自己要带 `overflow-anchor: none`，不然浏览器的滚动锚定会和这里的贴底打架。
 *
 * @param scroller 滚动区
 * @param content 滚动区里那一列内容（长高了才需要再贴一次）
 * @param resetKey 换了一个任务（或第一次拿到内容）就重新贴到底部
 */
export function useBottomFollow(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>, resetKey: string) {
  const [atBottom, setAtBottom] = useState(true);
  const follow = useRef(true);
  const last = useRef({ top: 0, height: 0 });

  const settle = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (follow.current) el.scrollTop = el.scrollHeight;
    last.current = { top: el.scrollTop, height: el.scrollHeight };
    setAtBottom(distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX);
  }, [scroller]);

  // 打开任务就落在底部：第一次画出来之前先贴一次，不让人先看到顶部再跳下来。
  useLayoutEffect(() => {
    follow.current = true;
    settle();
  }, [resetKey, settle]);

  useEffect(() => {
    const el = scroller.current;
    const col = content.current;
    if (!el || !col) return;
    let frame: number | null = null;
    // 长高、文字变化、新节点都合并到下一帧再处理一次。
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        settle();
      });
    };
    const onScroll = () => {
      const { top, height } = last.current;
      // 内容变矮时浏览器会把 scrollTop 夹小，那不是你在往上滚。
      const movedUp = el.scrollTop < top - 1 && el.scrollHeight >= height - 1;
      last.current = { top: el.scrollTop, height: el.scrollHeight };
      const near = distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX;
      if (movedUp) follow.current = false;
      else if (near) follow.current = true;
      setAtBottom(near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(col);
    resize?.observe(el);
    const mutation = new MutationObserver(schedule);
    mutation.observe(col, { childList: true, characterData: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      mutation.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [scroller, content, settle]);

  const scrollToBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    follow.current = true;
    if (prefersReducedMotion()) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [scroller]);

  return { atBottom, scrollToBottom };
}
