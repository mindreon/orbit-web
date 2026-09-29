import { useMemo, useState } from "react";
import type { Task } from "../../lib/tasks";
import { taskStatusText } from "./statusText";

interface TaskListProps {
  readonly tasks: readonly Task[];
  readonly selectedId: string | null;
  readonly onSelect: (taskId: string) => void;
  readonly onCreate: (input: { title: string; goal: string }) => Promise<void>;
}

const field = "mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

export function TaskList({ tasks, selectedId, onSelect, onCreate }: TaskListProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const newestFirst = useMemo(() => [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [tasks]);

  const create = async () => {
    if (!title.trim() || !goal.trim()) return;
    await onCreate({ title: title.trim(), goal: goal.trim() });
    setTitle("");
    setGoal("");
  };

  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 border-b border-slate-100 pb-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任务标题" className={field} />
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="任务目标" className={`${field} h-16 resize-none`} />
        <button type="button" onClick={() => void create()} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">创建任务</button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {newestFirst.map((item) => (
          <button
            type="button"
            key={item.task_id}
            onClick={() => onSelect(item.task_id)}
            className={`w-full rounded-xl px-3 py-3 text-left ${selectedId === item.task_id ? "bg-slate-100" : "hover:bg-slate-50"}`}
          >
            <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{taskStatusText[item.status] ?? item.status}</p>
          </button>
        ))}
      </div>
    </aside>
  );
}
