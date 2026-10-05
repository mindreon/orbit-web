import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";

interface UnwiredPageProps {
  readonly title: string;
  readonly icon: LucideIcon;
  /** 页头里的一句话说明，和 WorkBuddy 的页面副标题一样。 */
  readonly subtitle: string;
}

/**
 * 还没有接后端的入口：保持可见、能点进来，只讲用户听得懂的话，并给一个能继续走的出口。
 * 页头不放一个点不了的主按钮，唯一的主操作是回去新建任务。
 */
export function UnwiredPage({ title, icon, subtitle }: UnwiredPageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title={title} description={subtitle} />
      <div className="flex min-h-0 flex-1 bg-muted">
        <EmptyState
          icon={icon}
          title={`${title}还在准备中`}
          description={`${title}功能即将上线，现在可以先用任务完成工作。`}
          actions={
            <Link to="/" className="inline-flex h-9 items-center rounded-control bg-primary px-4 text-body font-medium text-primary-foreground hover:bg-primary-hover">
              新建任务
            </Link>
          }
        />
      </div>
    </div>
  );
}
