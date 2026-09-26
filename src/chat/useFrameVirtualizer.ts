import { useLayoutEffect, useReducer, useState } from "react";
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect, type VirtualizerOptions } from "@tanstack/react-virtual";
import { scheduleFrame } from "../lib/frame";

type Options = Omit<VirtualizerOptions<HTMLDivElement, Element>, "observeElementRect" | "observeElementOffset" | "scrollToFn" | "onChange">;

/**
 * useVirtualizer, except that measurement and scroll changes re-render on the shared frame scheduler
 * instead of immediately (the stock hook re-renders per change, with flushSync while scrolling).
 */
export function useFrameVirtualizer(options: Options) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const resolved: VirtualizerOptions<HTMLDivElement, Element> = {
    ...options,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => scheduleFrame(rerender),
  };
  const [instance] = useState(() => new Virtualizer(resolved));
  instance.setOptions(resolved);
  useLayoutEffect(() => instance._didMount(), [instance]);
  useLayoutEffect(() => instance._willUpdate());
  return instance;
}
