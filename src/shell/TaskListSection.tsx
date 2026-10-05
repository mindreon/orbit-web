import { ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { statusTone, isLive } from "../components/tasks/statusText";
import { cn } from "../lib/cn";
import { newestFirst, useTasksStore } from "../lib/tasksStore";
import { relativeTime } from "../lib/time";
import type { Task } from "../lib/tasks";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const REFRESH_MS = 15_000;

const DOT: Record<string, string> = { info: "bg-primary-500", warning: "bg-warning-500", danger: "bg-danger-500", success: "bg-success-500", neutral: "bg-gray-400" };

/** 侧栏里的任务列表：只有标题和相对时间，正在跑的带一个跳动的点。 */
export function TaskListSection({ query = "" }: { query?: string }) {
  const tasks = useTasksStore((state) => state.tasks);
  const error = useTasksStore((state) => state.error);
  const loaded = useTasksStore((state) => state.loaded);
  const load = useTasksStore((state) => state.load);
  const remove = useTasksStore((state) => state.remove);
  const [open, setOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

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

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const ok = await remove(deleteTarget.task_id);
    setDeleting(false);
    if (ok) {
      // 删除的正好是当前打开的任务时，回到新建任务页，别留在一个已删除的任务上。
      if (pathname === `/tasks/${deleteTarget.task_id}`) navigate("/", { replace: true });
      setDeleteTarget(null);
    } else {
      setDeleteError(useTasksStore.getState().error ?? "删除任务失败，请稍后重试。");
    }
  };

  return (
    <section aria-label="任务列表" className="min-h-0">
      <button type="button" aria-expanded={open} className="flex h-8 w-full items-center gap-1 px-3 text-caption font-medium text-gray-500 hover:text-gray-800" onClick={() => setOpen((value) => !value)}>
        任务 ({tasks.length})
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open ? (
        <ul className="flex flex-col gap-0.5">
          {shown.map((task) => {
            const tone = statusTone(task.status);
            return (
              <li key={task.task_id} className="group relative">
                <NavLink
                  to={`/tasks/${task.task_id}`}
                  className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-control pl-3 pr-8 text-body text-gray-800 hover:bg-gray-200", isActive && "bg-sidebar-accent font-medium text-primary-700 hover:bg-sidebar-accent")}
                >
                  {tone !== "neutral" && tone !== "success" ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone], isLive(task.status) && "animate-pulse")} /> : null}
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-caption text-gray-500 group-hover:opacity-0">{relativeTime(task.updated_at)}</span>
                </NavLink>
                <button
                  type="button"
                  aria-label={`删除任务 ${task.title}`}
                  title={isLive(task.status) ? "删除任务（进行中的任务会先取消）" : "删除任务"}
                  className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200 hover:text-danger-700 group-hover:flex"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDeleteError(null);
                    setDeleteTarget(task);
                  }}
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {shown.length === 0 && loaded ? <li className="px-3 py-1 text-caption text-gray-500">{error ?? (query ? "没有匹配的任务" : "暂无任务")}</li> : null}
        </ul>
      ) : null}
      {deleteTarget ? (
        <Dialog title="删除任务" onClose={() => (deleting ? null : setDeleteTarget(null))}>
          <p className="text-body leading-6 text-gray-700">
            确定要删除「{deleteTarget.title}」吗？{isLive(deleteTarget.status) ? "任务正在运行，会先被取消。" : ""}
            删除后不再出现在列表里，此操作不可撤销。
          </p>
          {deleteError ? (
            <p role="alert" className="mt-2 text-body leading-5 text-danger-700">
              {deleteError}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button size="sm" variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? "删除中…" : "删除"}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
