import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";

/** 居中弹窗：点遮罩或按 Esc 关闭。没有引入 Radix，够用即可。 */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
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
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`w-full rounded-card bg-card shadow-xl ${wide ? "max-w-4xl" : "max-w-md"}`}>
        <div className="flex h-14 items-center justify-between px-5">
          <h2 id={titleId} className="text-title font-semibold text-foreground">
            {title}
          </h2>
          <button type="button" aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
