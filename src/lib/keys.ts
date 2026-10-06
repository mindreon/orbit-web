import { useRef, type KeyboardEvent } from "react";

/** 焦点在能打字的地方：数字键、回车这类快捷键不该抢它的按键。 */
export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * 输入法选字的回车不算回车：选字期间（isComposing）、部分浏览器里 keyCode 是 229，
 * Safari 还会在 compositionend 之后紧跟着发一个回车，所以刚结束输入法的 ~120ms 内也不认。
 */
export function useImeGuard() {
  const endedAt = useRef(Number.NEGATIVE_INFINITY);
  return {
    onCompositionEnd: () => {
      endedAt.current = performance.now();
    },
    isImeKey: (event: KeyboardEvent): boolean => event.nativeEvent.isComposing || event.keyCode === 229 || performance.now() - endedAt.current < 120,
  };
}
