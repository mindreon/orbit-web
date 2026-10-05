import { useSyncExternalStore } from "react";

/** Breakpoints match Tailwind's: `sm` 640 (sidebar becomes a drawer below it), `lg` 1024 (task details become a drawer below it). */
export const BREAKPOINT = { sm: "(min-width: 640px)", lg: "(min-width: 1024px)" } as const;

/** Touch screens: no hardware keyboard to hint at. */
export const COARSE_POINTER = "(pointer: coarse)";

/** Live `window.matchMedia`; false where there is no window. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
