import { Check, ChevronRight, CircleSlash, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { toolLabel, type Step, type StepState } from "../../lib/conversation";

const STATE_ICON: Record<StepState, { Icon: typeof Check; className: string; label: string }> = {
  running: { Icon: Loader2, className: "animate-spin text-primary", label: "执行中" },
  success: { Icon: Check, className: "text-success", label: "成功" },
  error: { Icon: X, className: "text-destructive", label: "失败" },
  denied: { Icon: ShieldAlert, className: "text-warning", label: "已拒绝" },
  interrupted: { Icon: CircleSlash, className: "text-muted-foreground", label: "已中断" },
};

/** 已执行的步骤：默认折成一行，展开后看每一步的参数和结果。和 WorkBuddy 的"可展开中间步骤"一致。 */
export function StepList({ steps, active }: { steps: readonly Step[]; active: boolean }) {
  if (steps.length === 0) return null;
  const running = steps.some((step) => step.state === "running");
  return (
    <details className="group rounded-lg border border-border bg-muted/60 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        {running && active ? "正在执行步骤…" : `已执行 ${steps.length} 个步骤`}
      </summary>
      <ol className="space-y-2 border-t border-border px-3 py-2">
        {steps.map((step) => {
          const { Icon, className, label } = STATE_ICON[step.state];
          return (
            <li key={step.id} data-testid="step-row" className="text-[13px]">
              <div className="flex items-center gap-2">
                <Icon aria-label={label} className={cn("h-3.5 w-3.5 shrink-0", className)} />
                <span className="font-medium text-foreground">{toolLabel(step.tool)}</span>
                {step.tool !== toolLabel(step.tool) ? null : <span className="font-mono text-xs text-muted-foreground">{step.tool}</span>}
              </div>
              {step.args && step.args !== "{}" ? <p className="mt-1 truncate pl-5 font-mono text-xs text-muted-foreground">{step.args}</p> : null}
              {step.result ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap pl-5 text-xs text-muted-foreground">{step.result}</p> : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
