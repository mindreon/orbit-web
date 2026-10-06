import { Check, ChevronRight, Circle, Loader2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import type { ChecklistItem } from "../../lib/todos";
import { Avatar } from "../TeamAvatars";

const ownerTone = (role: string) => [...role].reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** 钉在输入框上方的执行清单：「执行清单 3/7」，正在做的一项加粗，点标题折起。 */
export function TodoChecklist({ todos }: { readonly todos: readonly ChecklistItem[] }) {
  const [open, setOpen] = useState(true);
  if (todos.length === 0) return null;
  const done = todos.filter((item) => item.status === "completed").length;
  const current = todos.find((item) => item.status === "in_progress");
  return (
    <div className="shrink-0 px-4 pt-2 sm:px-6">
      <section data-testid="todo-checklist" aria-label="执行清单" className="mx-auto max-w-reading rounded-card bg-muted text-body">
        <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen((value) => !value)}>
          <ChevronRight aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="shrink-0 font-medium text-foreground">
            执行清单 {done}/{todos.length}
          </span>
          {!open && current ? <span className="min-w-0 flex-1 truncate text-small text-muted-foreground">{current.content}</span> : null}
        </button>
        {open ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto px-3 pb-3 pl-9">
            {todos.map((item, index) => (
              <li key={index} data-testid="todo-item" data-status={item.status} className="flex items-start gap-2 text-small">
                {item.status === "completed" ? <Check aria-label="已完成" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-700" /> : item.status === "failed" ? <X aria-label="失败" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-700" /> : item.status === "in_progress" ? <Loader2 aria-label="进行中" className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary-700" /> : <Circle aria-label="待办" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className={cn(item.status === "in_progress" ? "font-semibold text-foreground" : item.status === "completed" ? "text-muted-foreground line-through" : item.status === "failed" ? "text-danger-700" : "text-foreground")}>{item.content}</span>
                {item.owner ? (
                  <span data-testid="todo-owner" className="ml-auto flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                    <Avatar name={item.owner.name || item.owner.label || item.owner.role} tone={ownerTone(item.owner.role)} />
                    {item.owner.name || item.owner.label || item.owner.role}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
