import type { Plan } from "../../lib/tasks";

export function PlanGraph({ plan }: { readonly plan: Plan | null }) {
  return (
    <section aria-label="计划图">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">计划图</h3>
      {plan?.nodes.map((node) => (
        <div key={node.node_id} data-testid="plan-node" data-status={node.status} className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">{node.title}</p>
          <p className="mt-1 text-xs text-slate-500">{node.type} · {node.status}</p>
          <p className="mt-1 text-[11px] text-slate-400">{node.node_id}</p>
        </div>
      ))}
    </section>
  );
}
