import { ChevronDown, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

/**
 * 输入框下方的「默认权限」：点开说明当前的权限边界。Orbit 只有沙箱加审批这一档，所以只读说明。
 * `compact`：输入框窄的时候只留图标（名字在无障碍标签里），省出位置给发送按钮。
 */
export function PermissionChip({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" data-testid="permission-chip" aria-label="默认权限" title="默认权限" aria-expanded={open} className={cn("flex h-8 items-center gap-1.5 rounded-control text-body text-gray-600 hover:bg-gray-100 hover:text-foreground", compact ? "w-8 justify-center" : "px-2")} onClick={() => setOpen((value) => !value)}>
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {compact ? null : (
          <>
            默认权限
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          </>
        )}
      </button>
      {open ? (
        <div role="note" className={cn("absolute bottom-full z-20 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-card bg-card p-3 text-small leading-5 text-muted-foreground shadow-lg ring-1 ring-border", compact ? "-left-10" : "left-0")}>
          当前为默认权限：所有操作都会在安全沙箱约束内进行，超出范围会在对话里请求你的允许。
        </div>
      ) : null}
    </div>
  );
}
