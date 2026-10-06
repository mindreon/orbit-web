import { TriangleAlert } from "lucide-react";
import { budgetWarnings, costSummary } from "../../lib/usage";
import { cn } from "../../lib/cn";

/**
 * 输入框上方的一行：用时、令牌数，算过价才写费用，没算过价的不写「未知」。
 * 任务设了预算且快用完（或已用完）时，另起一行提醒。
 */
export function TaskStats({ usage, budgets }: { readonly usage: Record<string, unknown> | undefined; readonly budgets: Record<string, unknown> | undefined }) {
  const summary = costSummary(usage);
  const warnings = budgetWarnings(usage, budgets);
  if (summary === "" && warnings.length === 0) return null;
  return (
    <div className="shrink-0 px-4 sm:px-6">
      <div className="mx-auto max-w-reading space-y-1 text-small">
        {summary ? (
          <p data-testid="task-stats" className="text-muted-foreground">
            {summary}
          </p>
        ) : null}
        {warnings.map((warning) => (
          <p key={warning.key} data-testid="budget-warning" role="status" className={cn("flex items-center gap-1.5", warning.over ? "text-danger-700" : "text-warning-700")}>
            <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {warning.text}
          </p>
        ))}
      </div>
    </div>
  );
}
