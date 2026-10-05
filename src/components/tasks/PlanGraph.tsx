import { ClipboardCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { approvalRoleLabel, groupPlan, nodeTitle, nodeTypeLabel, roleText, sopProgress, sopStepLabel, type NodeRole } from "../../lib/display";
import type { NodeState, ProfileSwitch, TeamStageView } from "../../lib/taskEvents";
import type { TeamView } from "../../lib/taskConfig";
import type { Plan } from "../../lib/tasks";
import { SegmentedTabs } from "../../ui/Tabs";
import { StatusBadge } from "../../ui/StatusBadge";
import { Avatar } from "../TeamAvatars";
import { NodeMenu, type NodeActions } from "./NodeActions";
import { withLimits } from "../../lib/team";
import { TeamStagePanel } from "./TeamStagePanel";
import { Section, SectionEmpty } from "./Section";
import { isLive, nodeStatusText, statusTone } from "./statusText";

interface PlanGraphProps {
  readonly plan: Plan | null;
  /** 事件里每个节点最近的状态和原因；计划里有而这里没有的节点（旧事件）照常显示。 */
  readonly nodes?: Readonly<Record<string, NodeState>>;
  /** 已请求切换专家、还没有哪一次执行用上的节点：从下一次执行起生效。 */
  readonly pendingSwitches?: Readonly<Record<string, ProfileSwitch>>;
  /** 步骤菜单（手动完成、切换专家）；不传就没有菜单。 */
  readonly actions?: NodeActions;
  /** 专家引用（id@版本）到显示名。 */
  readonly nameOf?: (ref: string) => string;
  /** 每个节点是谁的（领队、成员、复盘）；没有的节点什么也不标。 */
  readonly roles?: Readonly<Record<string, NodeRole>>;
  /** 任务选的是专家团时它的领队和成员：有了才出现「按成员」。 */
  readonly team?: TeamView | null;
  /** 一个团队协作节点的过程（回合、成员、便条）。 */
  readonly stageOf?: (nodeId: string) => TeamStageView | undefined;
}

type Grouping = "order" | "member";
const GROUPINGS = [
  { id: "order", label: "按顺序" },
  { id: "member", label: "按成员" },
] as const;

/** 失败重试、被阻塞时运行时给的原因，显示在节点下面。 */
const SHOWS_REASON = ["RETRY_PENDING", "BLOCKED"];

type PlanNode = Plan["nodes"][number];

export function PlanGraph({ plan, nodes = {}, pendingSwitches = {}, actions, nameOf = (ref) => ref, roles = {}, team = null, stageOf }: PlanGraphProps) {
  const archived = plan?.archived?.count ?? 0;
  const groups = groupPlan(plan?.nodes ?? []);
  const [grouping, setGrouping] = useState<Grouping>("order");

  /** 失败重试、被阻塞等的原因、手动完成、待生效的切换：节点和 SOP 步骤共用。 */
  const notes = (node: PlanNode) => {
    const pending = pendingSwitches[node.node_id];
    // 一个步骤被人手动完成时，原因随状态事件一起来；别的完成都没有原因。
    const byHand = node.status === "COMPLETED" && nodes[node.node_id]?.status === "COMPLETED" ? nodes[node.node_id].reason : "";
    const reason = SHOWS_REASON.includes(node.status) && nodes[node.node_id]?.status === node.status ? nodes[node.node_id].reason : "";
    return (
      <>
        {byHand ? <p data-testid="plan-node-by-hand" className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-small text-muted-foreground">由你手动完成：{byHand}</p> : null}
        {pending ? <p data-testid="plan-node-switch" className="mt-2 text-small text-muted-foreground">已改由 {nameOf(pending.to)} 执行（原为 {nameOf(pending.from)}），从下一次执行起生效。</p> : null}
        {reason ? <p data-testid="plan-node-reason" className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-small text-muted-foreground">{reason}</p> : null}
      </>
    );
  };

  /** SOP 里的一个节点：一步，或这一步前后的审批。 */
  const child = (node: PlanNode) => {
    const info = node.sop_step;
    const approval = info ? approvalRoleLabel(info.role) : "";
    return (
      <li key={node.node_id} data-testid="plan-step" data-role={info?.role} data-status={node.status} title={node.node_id} className="rounded-control bg-muted px-3 py-2">
        <p className="flex items-start justify-between gap-2 text-body text-foreground">
          <span className="flex min-w-0 items-start gap-1.5">
            {approval ? <ShieldQuestion aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" /> : null}
            <span className="min-w-0 font-medium">
              {approval ? `审批 · ${approval}` : info ? sopStepLabel(info) : nodeTitle(node.title)}
              {approval && info ? <span className="font-normal text-muted-foreground">{` · 第 ${info.index}/${info.total} 步 · ${info.subject}`}</span> : null}
            </span>
          </span>
          {actions && !approval ? <NodeMenu node={node} actions={actions} /> : null}
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-muted-foreground">
          <StatusBadge tone={statusTone(node.status)} pulse={isLive(node.status)}>
            {nodeStatusText[node.status] ?? node.status}
          </StatusBadge>
        </p>
        {notes(node)}
      </li>
    );
  };

  /** 计划里的一张卡片：一个节点，或一个 SOP 和它的步骤。 */
  const card = ({ node, children }: (typeof groups)[number]) => {
    const type = nodeTypeLabel(node.type);
    const progress = sopProgress(children);
    const role = roles[node.node_id];
    const stage = node.type === "team_stage" ? stageOf?.(node.node_id) : undefined;
    return (
      <div key={node.node_id} data-testid="plan-node" data-status={node.status} data-sop={children.length > 0 ? "true" : undefined} data-type={node.type} data-role={role?.kind === "member" ? role.role : undefined} data-kind={role?.kind} title={node.node_id} className="mt-2 rounded-card bg-card p-3">
        <p className="flex items-start justify-between gap-2 text-body font-semibold text-foreground">
          <span className="min-w-0">{nodeTitle(node.title)}</span>
          {actions && children.length === 0 ? <NodeMenu node={node} actions={actions} /> : null}
        </p>
        {role ? (
          <p data-testid="plan-node-role" data-kind={role.kind} className="mt-1.5 flex items-center gap-1.5 text-small text-gray-700">
            {role.kind === "review" ? <ClipboardCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" /> : <Avatar name={role.name || nameOf(role.expert)} tone={role.kind === "member" ? 1 : 0} />}
            <span className="min-w-0 truncate">{roleText(role, nameOf)}</span>
          </p>
        ) : null}
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-muted-foreground">
          <StatusBadge tone={statusTone(node.status)} pulse={isLive(node.status)}>
            {nodeStatusText[node.status] ?? node.status}
          </StatusBadge>
          {children.length > 0 ? <span data-testid="sop-progress">流程 · 已完成 {progress.done}/{progress.total} 步</span> : null}
          {type ? <span>{type}</span> : null}
          {node.depends_on.length > 0 ? <span>依赖 {node.depends_on.length} 个步骤</span> : null}
        </p>
        {notes(node)}
        {children.length > 0 ? <ol aria-label={`${nodeTitle(node.title)} 的步骤`} className="mt-3 flex flex-col gap-1.5">{children.map(child)}</ol> : null}
        {stage ? <TeamStagePanel stage={withLimits(stage, node.team)} /> : null}
      </div>
    );
  };

  /** 按成员看：领队一组，每位成员一组，剩下的（没有标明是谁的）放最后。 */
  const byMember = () => {
    const order = team ? [team.leader, ...team.members.map((member) => member.role).filter((role) => role !== team.leader)] : [];
    const buckets = new Map<string, typeof groups>(order.map((role) => [role, []]));
    const rest: typeof groups = [];
    for (const entry of groups) {
      const role = roles[entry.node.node_id]?.role;
      const bucket = role === undefined ? undefined : buckets.get(role);
      if (bucket) bucket.push(entry);
      else rest.push(entry);
    }
    return (
      <>
        {[...buckets.entries()].map(([role, entries]) => {
          const member = team?.members.find((item) => item.role === role);
          const label = roleText({ kind: role === team?.leader ? "leader" : "member", role, label: member?.label ?? "", expert: member?.expert ?? "", name: member?.name ?? "" }, nameOf);
          return (
            <section key={role} aria-label={`成员 ${label}`} data-testid="plan-member-group" data-role={role} className="mt-4 first:mt-2">
              <h4 className="flex items-center gap-1.5 text-small font-medium text-gray-700">
                <Avatar name={member?.name || nameOf(member?.expert ?? "")} tone={role === team?.leader ? 0 : 1} />
                {label}
                <span className="font-normal text-muted-foreground">· {entries.length} 个节点</span>
              </h4>
              {entries.length === 0 ? <p className="mt-1 text-small text-muted-foreground">还没有分到节点</p> : entries.map(card)}
            </section>
          );
        })}
        {rest.length > 0 ? (
          <section aria-label="未分配" data-testid="plan-member-group" data-role="" className="mt-4">
            <h4 className="text-small font-medium text-gray-700">其他 <span className="font-normal text-muted-foreground">· {rest.length} 个节点</span></h4>
            {rest.map(card)}
          </section>
        ) : null}
      </>
    );
  };

  return (
    <Section title="计划" label="计划图">
      {!plan || (plan.nodes.length === 0 && archived === 0) ? <SectionEmpty>还没有计划节点</SectionEmpty> : null}
      {archived > 0 ? (
        <p data-testid="plan-archived" title={plan?.archived?.recent_titles?.join("\n")} className="mt-2 text-small text-muted-foreground">
          已归档 {archived} 个已完成步骤
        </p>
      ) : null}
      {team && groups.length > 0 ? (
        <div className="mt-2">
          <SegmentedTabs label="计划分组" value={grouping} options={GROUPINGS} onChange={setGrouping} />
        </div>
      ) : null}
      {team && grouping === "member" ? byMember() : groups.map(card)}
    </Section>
  );
}
