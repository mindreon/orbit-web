import { useState } from "react";
import type { Task } from "../../lib/tasks";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { StatusBadge } from "../../ui/StatusBadge";
import { isLive, statusTone, taskStatusText } from "./statusText";

interface TaskHeaderProps {
  readonly task: Task;
  readonly onControl: (action: "pause" | "resume" | "cancel") => void;
}

export function TaskHeader({ task, onControl }: TaskHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const paused = task.status === "PAUSED";
  const closed = task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "FAILED";
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">{task.title}</h2>
          <StatusBadge tone={statusTone(task.status)} pulse={isLive(task.status)} data-testid="task-status" data-status={task.status}>
            {taskStatusText[task.status] ?? task.status}
          </StatusBadge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{task.goal}</p>
        <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span title="任务 ID" className="font-mono">{task.task_id}</span>
          <span>plan v{task.plan_version}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={closed} onClick={() => onControl(paused ? "resume" : "pause")}>
          {paused ? "继续" : "暂停"}
        </Button>
        <Button size="sm" variant="danger" disabled={closed} onClick={() => setConfirming(true)}>
          取消
        </Button>
      </div>
      {confirming ? (
        <Dialog title="取消任务" onClose={() => setConfirming(false)}>
          <p className="text-sm text-foreground/80">取消后正在执行的尝试会被中止，任务不能再继续。确定要取消「{task.title}」吗？</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>再想想</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onControl("cancel");
              }}
            >
              确认取消任务
            </Button>
          </div>
        </Dialog>
      ) : null}
    </header>
  );
}
