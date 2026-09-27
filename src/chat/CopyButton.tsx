import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { showToast } from "../lib/toast";

/** Copies `text` exactly as given (callers pass raw source, never rendered HTML) and confirms with a toast. */
export function CopyButton({ text, label = "复制", done = "已复制" }: { text: string; label?: string; done?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#666] hover:bg-black/5"
      onClick={() => {
        const settle = (next: "done" | "failed") => {
          setState(next);
          showToast(next === "done" ? done : "复制失败，请手动选中复制", next === "done" ? "ok" : "error");
          setTimeout(() => setState("idle"), 1500);
        };
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
      {state === "done" ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {state === "done" ? "已复制" : state === "failed" ? "复制失败" : label}
    </button>
  );
}
