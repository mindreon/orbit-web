import { useSyncExternalStore } from "react";

type Toast = { id: number; text: string; tone: "ok" | "error" };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

/** Shows one short confirmation; a newer toast replaces the previous one. */
export function showToast(text: string, tone: Toast["tone"] = "ok") {
  current = { id: ++nextId, text, tone };
  publish();
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    publish();
  }, 1800);
}

export function useToast() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
