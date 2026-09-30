import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";

/** 居中弹窗：点遮罩或按 Esc 关闭。没有引入 Radix，够用即可。 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <h2 id={titleId} className="text-[15px] font-semibold text-foreground">
            {title}
          </h2>
          <button type="button" aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
