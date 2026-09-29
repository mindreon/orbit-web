import type { Task } from "../../lib/tasks";
import { taskStatusText } from "./statusText";

interface TaskHeaderProps {
  readonly task: Task;
  readonly onControl: (action: "pause" | "resume" | "cancel") => void;
}

export function TaskHeader({ task, onControl }: TaskHeaderProps) {
  const paused = task.status === "PAUSED";
  const closed = task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "FAILED";
  return (
    <header className="flex items-start justify-between border-b border-slate-100 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{task.goal}</p>
        <p className="mt-2 text-xs text-slate-400">
          {task.task_id} · <span data-testid="task-status" data-status={task.status}>{taskStatusText[task.status] ?? task.status}</span> · plan v{task.plan_version}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={closed} onClick={() => onControl(paused ? "resume" : "pause")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">
          {paused ? "继续" : "暂停"}
        </button>
        <button type="button" disabled={closed} onClick={() => onControl("cancel")} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 disabled:opacity-40">取消</button>
      </div>
    </header>
  );
}
