import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router";
import { statusTone, isLive } from "../components/tasks/statusText";
import { cn } from "../lib/cn";
import { newestFirst, useTasksStore } from "../lib/tasksStore";
import { relativeTime } from "../lib/time";

const REFRESH_MS = 15_000;

const DOT: Record<string, string> = { info: "bg-primary", warning: "bg-warning", danger: "bg-destructive", success: "bg-success", neutral: "bg-muted-foreground/40" };

/** 侧栏里的任务列表：只有标题和相对时间，正在跑的带一个跳动的点。 */
export function TaskListSection({ query = "" }: { query?: string }) {
  const tasks = useTasksStore((state) => state.tasks);
  const error = useTasksStore((state) => state.error);
  const loaded = useTasksStore((state) => state.loaded);
  const load = useTasksStore((state) => state.load);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = newestFirst(tasks);
    return needle ? sorted.filter((task) => task.title.toLowerCase().includes(needle)) : sorted;
  }, [tasks, query]);

  return (
    <section aria-label="任务列表" className="min-h-0">
      <button type="button" aria-expanded={open} className="flex h-8 w-full items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((value) => !value)}>
        任务 ({tasks.length})
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open ? (
        <ul className="space-y-0.5">
          {shown.map((task) => {
            const tone = statusTone(task.status);
            return (
              <li key={task.task_id}>
                <NavLink
                  to={`/tasks/${task.task_id}`}
                  className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-foreground/80 hover:bg-secondary", isActive && "bg-sidebar-accent font-medium text-accent-foreground hover:bg-sidebar-accent")}
                >
                  {tone !== "neutral" && tone !== "success" ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone], isLive(task.status) && "animate-pulse")} /> : null}
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(task.updated_at)}</span>
                </NavLink>
              </li>
            );
          })}
          {shown.length === 0 && loaded ? <li className="px-3 py-1 text-xs text-muted-foreground">{error ?? (query ? "没有匹配的任务" : "暂无任务")}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
