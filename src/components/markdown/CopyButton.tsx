import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

const SETTLE_MS = 1500;

/** Copies `text` exactly as given (callers pass raw source, never rendered HTML) and shows the outcome on the button. */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const settle = (next: "done" | "failed") => {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), SETTLE_MS);
  };
  const shown = state === "done" ? "已复制" : state === "failed" ? "复制失败" : label;
  return (
    <button
      type="button"
      aria-label={shown}
      title={shown}
      className="flex h-7 items-center gap-1 rounded-control px-1.5 text-caption text-muted-foreground hover:bg-gray-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        if (!navigator.clipboard) {
          settle("failed");
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => settle("done"),
          () => settle("failed"),
        );
      }}
    >
      {state === "done" ? <Check className="h-4 w-4 text-success-700" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {state === "idle" ? null : <span>{shown}</span>}
    </button>
  );
}
