import { useEffect, useState } from "react";
import { scheduleFrame } from "../../lib/frame";

/** A module loaded on first need, shared by every component that asks for it. */
export interface LazyModule<T> {
  current: T | null;
  load: () => Promise<T>;
}

export function lazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let pending: Promise<T> | null = null;
  const mod: LazyModule<T> = {
    current: null,
    load: () => {
      pending ??= loader().then((value) => {
        mod.current = value;
        return value;
      });
      return pending;
    },
  };
  return mod;
}

/** Returns the module once loaded; starts loading only when `needed`. Renders plain content until then. */
export function useLazyModule<T>(mod: LazyModule<T>, needed: boolean): T | null {
  const [value, setValue] = useState<T | null>(mod.current);
  useEffect(() => {
    if (!needed || value) return;
    let cancelled = false;
    void mod.load().then((loaded) => {
      scheduleFrame(() => {
        if (!cancelled) setValue(() => loaded);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mod, needed, value]);
  return value ?? mod.current;
}

export const katexModule = lazyModule(() => import("./katexPlugin").then((module) => module.default));
export const highlighterModule = lazyModule(() => import("./highlighter").then((module) => module.highlight));
