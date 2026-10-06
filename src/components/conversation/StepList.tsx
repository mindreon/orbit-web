import { Check, ChevronRight, CircleSlash, ListChecks, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { toolLabel, type Step, type StepState } from "../../lib/conversation";
import { isTodoStep } from "../../lib/todos";

const STATE_ICON: Record<StepState, { Icon: typeof Check; className: string; label: string }> = {
  running: { Icon: Loader2, className: "animate-spin text-primary-700", label: "执行中" },
  success: { Icon: Check, className: "text-success-700", label: "成功" },
  error: { Icon: X, className: "text-danger-700", label: "失败" },
  denied: { Icon: ShieldAlert, className: "text-warning-700", label: "已拒绝" },
  interrupted: { Icon: CircleSlash, className: "text-muted-foreground", label: "已中断" },
};

/** 已执行的步骤：默认折成一行，展开后看每一步的参数和结果。和 WorkBuddy 的"可展开中间步骤"一致。 */
export function StepList({ steps: all, active }: { steps: readonly Step[]; active: boolean }) {
  // 清单的更新不算「步骤」：清单本身钉在输入框上方，这里只留一行淡色的提示。
  const steps = all.filter((step) => !isTodoStep(step));
  const todoUpdated = steps.length < all.length;
  if (steps.length === 0) return todoUpdated ? <TodoUpdated /> : null;
  const running = steps.some((step) => step.state === "running");
  return (
    <div className="space-y-2">
      {todoUpdated ? <TodoUpdated /> : null}
      <details className="group rounded-card bg-muted text-body">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        {running && active ? "正在执行步骤…" : `已执行 ${steps.length} 个步骤`}
      </summary>
      <ol className="space-y-2 px-3 pb-3 pt-1">
        {steps.map((step) => {
          const { Icon, className, label } = STATE_ICON[step.state];
          return (
            <li key={step.id} data-testid="step-row" className="text-small">
              <div className="flex items-center gap-2">
                <Icon aria-label={label} className={cn("h-3.5 w-3.5 shrink-0", className)} />
                <span className="font-medium text-foreground">{toolLabel(step.tool)}</span>
                {step.tool !== toolLabel(step.tool) ? null : <span className="font-mono text-caption text-muted-foreground">{step.tool}</span>}
              </div>
              {step.args && step.args !== "{}" ? <p className="mt-1 truncate pl-5 font-mono text-caption text-muted-foreground">{step.args}</p> : null}
              {step.result ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap pl-5 text-caption text-muted-foreground">{step.result}</p> : null}
            </li>
          );
        })}
      </ol>
      </details>
    </div>
  );
}

function TodoUpdated() {
  return (
    <p data-testid="todo-updated" className="flex items-center gap-2 px-1 text-small text-muted-foreground">
      <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
      清单已更新
    </p>
  );
}
