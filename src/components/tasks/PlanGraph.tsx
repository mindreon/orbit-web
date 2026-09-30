import type { Plan } from "../../lib/tasks";
import { StatusBadge } from "../../ui/StatusBadge";
import { Section, SectionEmpty } from "./Section";
import { isLive, nodeStatusText, nodeTypeText, statusTone } from "./statusText";

export function PlanGraph({ plan }: { readonly plan: Plan | null }) {
  return (
    <Section title="计划" label="计划图">
      {!plan || plan.nodes.length === 0 ? <SectionEmpty>还没有计划节点</SectionEmpty> : null}
      {plan?.nodes.map((node) => (
        <div key={node.node_id} data-testid="plan-node" data-status={node.status} title={node.node_id} className="mt-2 rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">{node.title}</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge tone={statusTone(node.status)} pulse={isLive(node.status)}>
              {nodeStatusText[node.status] ?? node.status}
            </StatusBadge>
            <span>{nodeTypeText[node.type] ?? node.type}</span>
            {node.depends_on.length > 0 ? <span>· 依赖 {node.depends_on.length} 个节点</span> : null}
            {node.frozen ? <span>· 已冻结</span> : null}
          </p>
        </div>
      ))}
    </Section>
  );
}
