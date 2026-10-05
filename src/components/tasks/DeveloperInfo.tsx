import type { Plan, Task } from "../../lib/tasks";

/**
 * Ids and versions that matter to whoever debugs the task, not to whoever uses it. They live in a collapsed
 * disclosure instead of the task header and message footers.
 */
export function DeveloperInfo({ task, plan }: { readonly task: Task; readonly plan: Plan | null }) {
  const rows: readonly [string, string][] = [
    ["任务 ID", task.task_id],
    ["工作流", task.workflow_id],
    ["计划版本", `plan v${task.plan_version}`],
    ["计划哈希", plan?.hash ?? ""],
    ["专家引用", task.profile],
  ];
  return (
    <details data-testid="developer-info" className="rounded-card bg-card">
      <summary className="cursor-pointer px-3 py-2 text-small font-medium text-gray-700">开发者信息</summary>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 pb-3 text-caption">
        {rows
          .filter(([, value]) => value !== "")
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all font-mono text-gray-700">{value}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}
