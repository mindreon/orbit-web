import { Check, Circle, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import type { ChecklistItem } from "../../lib/todos";
import { usePopoverClose } from "../../lib/usePopoverClose";
import { Avatar } from "../TeamAvatars";

const ownerTone = (role: string) => [...role].reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** 做完之后留多久再淡出，以及淡出本身多久（毫秒）。 */
const LINGER_MS = 1600;
const FADE_MS = 300;

/** 一圈 14px 的进度环：已完成的占几分之几，有失败的项就换成危险色。 */
function Ring({ done, total, failed }: { done: number; total: number; failed: boolean }) {
  const filled = failed ? "hsl(var(--danger-500))" : "hsl(var(--primary-600))";
  return (
    <span aria-hidden="true" data-testid="plan-ring" data-failed={failed ? "true" : undefined} className="relative h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: `conic-gradient(${filled} ${(done / total) * 100}%, hsl(var(--gray-300)) 0)` }}>
      <span className="absolute inset-[2px] rounded-full bg-muted" />
    </span>
  );
}

interface PlanPillProps {
  readonly todos: readonly ChecklistItem[];
  /** 任务现在没在跑：全部做完又空闲下来，胶囊才淡出。 */
  readonly idle: boolean;
  /** 输入框位置上有一张等你处理的卡片：胶囊让位。 */
  readonly suppressed?: boolean;
}

/**
 * 输入框上方居中的一粒「已完成 N/M 步」：带一圈进度环，点开在上方列出每一项（已完成、进行中、失败、待办；团队任务还有负责的成员）。
 * 全部完成、任务也空闲下来之后淡出；刷新进来时已经是做完的，就不再出现。
 */
export function PlanPill({ todos, idle, suppressed = false }: PlanPillProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");
  const box = useRef<HTMLDivElement>(null);
  const baseline = useRef<"unset" | "done" | "live">("unset");
  usePopoverClose(open, box, () => setOpen(false));
  const total = todos.length;
  const done = todos.filter((item) => item.status === "completed").length;
  const failed = todos.some((item) => item.status === "failed");
  const finished = total > 0 && done === total && idle;

  useEffect(() => {
    if (total === 0) return;
    if (baseline.current === "unset") {
      baseline.current = finished ? "done" : "live";
      if (finished) {
        setPhase("gone");
        return;
      }
    }
    if (!finished) {
      setPhase("shown");
      return;
    }
    const fade = setTimeout(() => setPhase("fading"), LINGER_MS);
    const gone = setTimeout(() => {
      setPhase("gone");
      setOpen(false);
    }, LINGER_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [finished, total]);

  if (total === 0 || suppressed || phase === "gone") return null;
  return (
    <div className="shrink-0 px-4 pb-2 sm:px-6">
      <div ref={box} className={cn("relative mx-auto flex max-w-reading justify-center transition-opacity", phase === "fading" ? "pointer-events-none opacity-0" : "opacity-100")} style={{ transitionDuration: `${FADE_MS}ms` }}>
        <button
          type="button"
          data-testid="todo-checklist"
          data-phase={phase}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-body font-medium text-foreground shadow-lg ring-1 ring-border hover:bg-secondary"
          onClick={() => setOpen((value) => !value)}
        >
          <Ring done={done} total={total} failed={failed} />
          已完成 {done}/{total} 步
        </button>
        {open ? (
          <div role="dialog" aria-label="执行清单" data-testid="todo-popover" className="menu-in absolute bottom-full left-1/2 z-20 mb-2 max-h-72 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-card bg-card p-2 shadow-lg ring-1 ring-border">
            <ul className="space-y-0.5">
              {todos.map((item, index) => (
                <li key={index} data-testid="todo-item" data-status={item.status} className="flex min-h-8 items-start gap-2 rounded-control px-2 py-1.5 text-body">
                  {item.status === "completed" ? (
                    <Check aria-label="已完成" className="mt-0.5 h-4 w-4 shrink-0 text-success-700" />
                  ) : item.status === "failed" ? (
                    <X aria-label="失败" className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" />
                  ) : item.status === "in_progress" ? (
                    <Loader2 aria-label="进行中" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-700" />
                  ) : (
                    <Circle aria-label="待办" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("min-w-0 flex-1 break-words", item.status === "in_progress" ? "font-medium text-foreground" : item.status === "completed" ? "text-muted-foreground" : item.status === "failed" ? "text-danger-700" : "text-foreground")}>{item.content}</span>
                  {item.owner ? (
                    <span data-testid="todo-owner" className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                      <Avatar name={item.owner.name || item.owner.label || item.owner.role} tone={ownerTone(item.owner.role)} />
                      {item.owner.name || item.owner.label || item.owner.role}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
