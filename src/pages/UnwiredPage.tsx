import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";

interface UnwiredPageProps {
  readonly title: string;
  readonly icon: LucideIcon;
  /** 页头里的一句话说明，和 WorkBuddy 的页面副标题一样。 */
  readonly subtitle: string;
  /** 这个功能开放后的主操作名，先显示成禁用的按钮。 */
  readonly action: string;
}

/** 还没有接后端的入口：保持可见，说明清楚，并给一个能继续走的出口。 */
export function UnwiredPage({ title, icon, subtitle, action }: UnwiredPageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader
        title={title}
        description={subtitle}
        actions={
          <Button variant="primary" disabled title="后端还没有接入">
            {action}
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 bg-muted">
        <EmptyState
          icon={icon}
          title={`${title}即将开放`}
          description="这个功能还没有接入后端，先用任务、专家、技能和连接器完成工作，后续版本会开放。"
          actions={
            <Link to="/" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              新建任务
            </Link>
          }
        />
      </div>
    </div>
  );
}
