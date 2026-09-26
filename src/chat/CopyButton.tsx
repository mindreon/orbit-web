import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#666] hover:bg-black/5"
      onClick={() => {
        const reset = () => setTimeout(() => setState("idle"), 1500);
        if (!navigator.clipboard) {
          setState("failed");
          reset();
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => setState("done"),
          () => setState("failed"),
        ).finally(reset);
      }}
    >
      {state === "done" ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {state === "done" ? "已复制" : state === "failed" ? "复制失败" : label}
    </button>
  );
}
