import { useLayoutEffect, useState, type RefObject } from "react";

/** 元素当前的宽度（像素）；还没量到之前是 null。窄屏上的收起判断看的是输入框自己的宽度，不是窗口宽度（侧栏、详情面板都会挤它）。 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
