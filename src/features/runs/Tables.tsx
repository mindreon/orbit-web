import { DataTable as ReplayTable } from "../../components/DataTable";
import type { S } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import { groupCosts } from "./costs";
import { decisionChoiceLabels, interactionKindLabels } from "../interactions";
import { effectStateLabels, endReasonLabels, interactionStateLabels, segmentStateLabels } from "./labels";
export const credits = (value: number) => `${value / 1000} 积分`;
export const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";
const numberCell = "text-right tabular-nums";
export function SegmentTable({ items }: { items: readonly S["Segment"][] }) {
  if (!items.length) return <p className="text-small text-muted-foreground">没有段记录</p>;
  return <ReplayTable name="段" headers={["成员", "序号", "状态", "结束原因", "错误码", "迭代", "耗时", "检查点版本", "成本"]}>{items.map((item) => <tr key={`${item.member}:${item.seq}`}><td className="font-mono">{item.member}</td><td className={numberCell}>{item.seq}</td><td><StatusBadge status={item.status}>{segmentStateLabels[item.status]}</StatusBadge></td><td>{item.end_reason ? endReasonLabels[item.end_reason] : "—"}</td><td className="font-mono">{item.error_code ?? "—"}</td><td className={numberCell}>{item.iterations}</td><td className={numberCell}>{item.duration_ms === null ? "—" : `${item.duration_ms / 1000} 秒`}</td><td className="text-right font-mono">{item.checkpoint_version ?? "—"}</td><td className={numberCell}>{credits(item.cost_millicredits)}</td></tr>)}</ReplayTable>;
}
export function EffectsTable({ items }: { items: readonly S["RunEffect"][] }) {
  if (!items.length) return <p className="text-small text-muted-foreground">没有工具副作用</p>;
  return <ReplayTable name="工具副作用" headers={["成员", "工具", "副作用类别", "状态", "外部引用", "开始", "结束"]}>{items.map((item) => <tr key={item.id}><td className="font-mono">{item.member}</td><td className="font-mono">{item.tool}</td><td className="font-mono">{item.effect_class}</td><td><StatusBadge status={item.status}>{effectStateLabels[item.status]}</StatusBadge></td><td className="font-mono">{item.external_ref ?? "—"}</td><td>{dateTime(item.created_at)}</td><td>{dateTime(item.completed_at)}</td></tr>)}</ReplayTable>;
}
export function CostTable({ cost }: { cost: S["RunCost"] }) {
  const groups = groupCosts(cost.items);
  return <><p className="mb-3 text-body">成本合计 <span data-testid="cost-total" data-millicredits={cost.total_millicredits} className="tabular-nums">{credits(cost.total_millicredits)}</span></p>{groups.length ? <ReplayTable name="成本明细" headers={["成员", "模型", "计量项", "数量", "成本"]}>{groups.map((group) => <tr key={group.key}><td className="font-mono">{group.member ?? "—"}</td><td className="font-mono">{group.model ?? "—"}</td><td className="font-mono">{group.meter}</td><td className="text-right font-mono tabular-nums" title={group.quantities.length > 1 ? group.quantities.join(" + ") : undefined}>{group.total}</td><td className={numberCell}>{credits(group.millicredits)}</td></tr>)}</ReplayTable> : <p className="text-small text-muted-foreground">没有成本明细</p>}</>;
}
export function InteractionList({ items, principalId }: { items: readonly S["Interaction"][]; principalId: string }) {
  if (!items.length) return <p className="text-small text-muted-foreground">没有审批记录</p>;
  return <ul aria-label="审批记录" className="divide-y divide-border rounded-card bg-card">{items.map((item) => {
    const summary = item.request.question?.text ?? item.request.effect?.tool ?? item.request.calls?.map((call) => `${call.name} ${call.args_preview}`).join("；") ?? "—";
    return <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-3 text-small"><span>{interactionKindLabels[item.request.kind]}</span><span title={summary} className="min-w-0 max-w-full flex-1 truncate font-mono">{summary}</span><StatusBadge status={item.status}>{interactionStateLabels[item.status]}</StatusBadge><span>{item.decision ? item.decision.choice ? decisionChoiceLabels[item.decision.choice] : item.decision.answer : "—"}</span><span className={item.decided_by && item.decided_by !== principalId ? "font-mono" : "text-muted-foreground"}>{item.decided_by === principalId ? "你" : item.decided_by ?? "—"}</span><time dateTime={item.created_at} className="text-caption text-muted-foreground">{dateTime(item.created_at)}</time></li>;
  })}</ul>;
}
