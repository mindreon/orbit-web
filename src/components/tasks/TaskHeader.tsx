import { PanelRight } from "lucide-react";
import { useState } from "react";
import type { Task } from "../../lib/tasks";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { StatusBadge } from "../../ui/StatusBadge";
import { isLive, statusTone, taskStatusText } from "./statusText";

interface TaskHeaderProps {
  readonly task: Task;
  readonly onControl: (action: "pause" | "resume" | "cancel") => void;
  /** 详情面板收起时才显示「展开」按钮。 */
  readonly panelOpen: boolean;
  readonly onOpenPanel: () => void;
}

export function TaskHeader({ task, onControl, panelOpen, onOpenPanel }: TaskHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const paused = task.status === "PAUSED";
  const closed = task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "FAILED";
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
      <h2 title={task.task_id} className="min-w-0 truncate text-base font-semibold text-foreground">
        {task.title}
      </h2>
      <StatusBadge tone={statusTone(task.status)} pulse={isLive(task.status)} data-testid="task-status" data-status={task.status}>
        {taskStatusText[task.status] ?? task.status}
      </StatusBadge>
      <span className="hidden text-xs text-muted-foreground md:inline">plan v{task.plan_version}</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {closed ? null : (
          <>
            <Button size="sm" onClick={() => onControl(paused ? "resume" : "pause")}>
              {paused ? "继续" : "暂停"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
              取消
            </Button>
          </>
        )}
        {panelOpen ? null : (
          <button type="button" aria-label="展开详情" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={onOpenPanel}>
            <PanelRight className="h-4 w-4" />
          </button>
        )}
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
