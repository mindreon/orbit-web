import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";

/** 还没有接后端的入口：保持可见，说明清楚，并给一个能继续走的出口。 */
export function UnwiredPage({ title, icon }: { title: string; icon: LucideIcon }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title={title} />
      <div className="flex min-h-0 flex-1 bg-muted">
        <EmptyState
          icon={icon}
          title={`${title}即将开放`}
          description="这个功能还没有接入后端，先用任务和助理完成工作，后续版本会开放。"
          actions={
            <Link to="/tasks" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              回到任务
            </Link>
          }
        />
      </div>
    </div>
  );
}
