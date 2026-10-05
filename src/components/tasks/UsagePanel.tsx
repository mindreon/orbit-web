import type { BudgetAmounts } from "../../lib/taskEvents";
import { isUsageIdle, usageRows } from "../../lib/usage";
import { Section } from "./Section";

interface UsagePanelProps {
  readonly usage: Record<string, unknown> | undefined;
  readonly budgets: Record<string, unknown> | undefined;
  /** 正在运行的执行占着的额度。 */
  readonly reserved: BudgetAmounts;
}

/**
 * 任务已经用了多少、上限是多少、正在运行的执行占着多少。没算过价的费用写「未知」，不写 0；
 * 还什么都没有用、也没设上限时只留一行，不摆四行「0 / 不限」。没有上限的项不写「不限」，只有设了才写上限。
 */
export function UsagePanel({ usage, budgets, reserved }: UsagePanelProps) {
  if (isUsageIdle(usage, budgets, reserved)) {
    return (
      <section aria-label="用量与预算" data-testid="usage-idle" className="mt-6 first:mt-0">
        <p className="text-small text-muted-foreground">
          <span className="font-medium">用量与预算</span>
          <span className="ml-2">暂无用量，未设上限</span>
        </p>
      </section>
    );
  }
  const rows = usageRows(usage, budgets, reserved);
  return (
    <Section title="用量与预算" label="用量与预算">
      <dl data-testid="usage-panel" className="mt-2 rounded-card bg-card px-3 py-2">
        {rows.map((row) => (
          <div key={row.key} data-testid="usage-row" data-key={row.key} className="flex flex-wrap items-baseline gap-x-2 py-1 text-small">
            <dt className="w-16 shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="font-medium text-foreground" data-testid="usage-used">{row.used}</dd>
            {row.limit ? <dd className="text-muted-foreground">/ 上限 {row.limit}</dd> : null}
            {row.reserved ? <dd data-testid="usage-reserved" className="text-muted-foreground">· 占用 {row.reserved}</dd> : null}
          </div>
        ))}
      </dl>
    </Section>
  );
}
