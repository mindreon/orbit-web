import { SquarePen } from "lucide-react";
import { Link, Outlet } from "react-router";
import { isEmbeddedInWujie } from "../embed/wujie";
import { TaskListSection } from "./TaskListSection";

/**
 * 新建任务页和任务页共用的布局。独立部署时任务列表在侧栏里，这里什么都不加；
 * 嵌入 baize 时没有我们的侧栏，就在内容区左边放一条任务栏，任务列表不会丢。
 */
export function TasksLayout() {
  if (!isEmbeddedInWujie()) return <Outlet />;
  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="任务栏" className="flex w-60 shrink-0 flex-col bg-muted">
        <div className="p-3">
          <Link to="/" className="flex h-9 items-center gap-2 rounded-control bg-primary px-3 text-body font-medium text-primary-foreground hover:bg-primary-hover">
            <SquarePen aria-hidden="true" className="h-4 w-4" />
            新建任务
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <TaskListSection />
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
