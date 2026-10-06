import { useEffect, type RefObject } from "react";

/** 弹层开着时，点到锚点外面或按 Esc 就收起。`anchorRef` 是触发按钮所在的 relative 容器。 */
export function usePopoverClose(open: boolean, anchorRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => !anchorRef.current?.contains(event.target as Node) && close();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, close]);
}
