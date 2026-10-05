import { Repeat2, UserRoundCheck, Wallet } from "lucide-react";
import type { BudgetAmounts, ReviewNotice as Review } from "../../lib/taskEvents";
import { Attention } from "../../ui/Attention";
import { Button } from "../../ui/Button";
import { BudgetGrantForm } from "./BudgetGrantForm";
import { planRejectionText } from "./statusText";

interface ReviewNoticeProps {
  /** 运行时给出的原因；任务在等人但事件里没有原因（旧任务）时为 null。 */
  readonly review: Review | null;
  readonly onResume: () => void;
  /** 追加预算；成功返回 null，失败返回原因。 */
  readonly onGrantBudget?: (delta: BudgetAmounts) => Promise<string | null>;
}

/** 任务停在「需要复核」：说清楚在等你、为什么，并给出「继续」——被阻塞的步骤会重新开始。 */
export function ReviewNotice({ review, onResume, onGrantBudget }: ReviewNoticeProps) {
  const rejection = review?.rejection ?? null;
  const budget = review?.budget;
  if (budget) {
    return (
      <Attention aria-label="预算用尽" data-testid="review-notice" data-kind="budget" tone="danger" icon={Wallet} title="预算用尽">
        {budget.detail ? <p data-testid="review-budget-detail" className="mt-2 whitespace-pre-wrap break-words text-body text-gray-700">{budget.detail}</p> : null}
        {review?.reason ? <p data-testid="review-reason" className="mt-1 whitespace-pre-wrap break-words text-small text-muted-foreground">原因：{review.reason}</p> : null}
        {onGrantBudget ? <BudgetGrantForm onGrant={onGrantBudget} /> : null}
      </Attention>
    );
  }
  const limit = review?.limit;
  if (limit) {
    return (
      <Attention aria-label="领队复盘已到上限" data-testid="review-notice" data-kind="review_limit" icon={Repeat2} title={`领队复盘已到上限（${limit.maxRounds} 轮）`}>
        <p data-testid="review-limit-detail" className="mt-2 text-body text-gray-700">
          领队已经复盘了 {limit.maxRounds} 轮，第 {limit.round} 轮创建的 {limit.children} 个任务完成后没有再复盘，所以停下来等你。
        </p>
        {review?.reason ? <p data-testid="review-reason" className="mt-1 whitespace-pre-wrap break-words text-small text-muted-foreground">原因：{review.reason}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" data-testid="review-resume" onClick={onResume}>继续</Button>
          <span className="text-small text-muted-foreground">继续后，任务按现有的计划收尾，不再追加复盘。</span>
        </div>
      </Attention>
    );
  }
  return (
    <Attention
      aria-label="需要复核"
      data-testid="review-notice"
      data-kind={rejection ? "rejected" : "review"}
      icon={UserRoundCheck}
      title={
        <>
          {rejection ? "你追加的消息没有被采纳" : "任务在等你处理"}
          {rejection ? <span className="rounded-control bg-card px-1.5 py-0.5 text-caption font-medium text-gray-700">{planRejectionText[rejection.code] ?? rejection.code}</span> : null}
        </>
      }
    >
      {review?.reason ? <p data-testid="review-reason" className="mt-2 whitespace-pre-wrap break-words text-body text-gray-700">原因：{review.reason}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" data-testid="review-resume" onClick={onResume}>继续</Button>
        <span className="text-small text-muted-foreground">继续后，被阻塞的步骤会重新开始。</span>
      </div>
    </Attention>
  );
}
