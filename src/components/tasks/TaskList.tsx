import { useMemo } from "react";
import { cn } from "../../lib/cn";
import type { Task } from "../../lib/tasks";
import { StatusBadge } from "../../ui/StatusBadge";
import { formatTime, isLive, statusTone, taskStatusText } from "./statusText";

interface TaskListProps {
  readonly tasks: readonly Task[];
  readonly selectedId: string | null;
  readonly onSelect: (taskId: string) => void;
}

export function TaskList({ tasks, selectedId, onSelect }: TaskListProps) {
  const newestFirst = useMemo(() => [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [tasks]);
  return (
    <aside aria-label="任务列表" className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4 text-xs text-muted-foreground">
        <span>全部任务</span>
        <span>{tasks.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {newestFirst.map((item) => (
          <button
            type="button"
            key={item.task_id}
            onClick={() => onSelect(item.task_id)}
            className={cn("mb-1 w-full rounded-lg px-3 py-2.5 text-left", selectedId === item.task_id ? "bg-accent" : "hover:bg-secondary")}
          >
            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1.5 flex items-center justify-between gap-2">
              <StatusBadge tone={statusTone(item.status)} pulse={isLive(item.status)}>
                {taskStatusText[item.status] ?? item.status}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">{formatTime(item.updated_at)}</span>
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
