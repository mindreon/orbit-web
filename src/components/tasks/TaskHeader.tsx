import { MoreHorizontal, PanelRight } from "lucide-react";
import { useState } from "react";
import type { Task } from "../../lib/tasks";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { StatusBadge } from "../../ui/StatusBadge";
import { isLive, statusTone, taskStatusText } from "./statusText";

interface TaskHeaderProps {
  readonly task: Task;
  readonly onCancel: () => void;
  /** 详情面板收起时才显示「展开」按钮。 */
  readonly panelOpen: boolean;
  readonly onOpenPanel: () => void;
}

export function TaskHeader({ task, onCancel, panelOpen, onOpenPanel }: TaskHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 任务是一场对话：做完只是空闲，还能继续聊；只有取消才算结束。
  const cancelled = task.status === "CANCELLED";
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
        {cancelled ? null : (
          <div className="relative">
            <button
              type="button"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-9 z-20 min-w-36 rounded-lg border border-border bg-card p-1 shadow-md">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirming(true);
                    }}
                  >
                    取消任务
                  </button>
                </div>
              </>
            ) : null}
          </div>
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
                onCancel();
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
