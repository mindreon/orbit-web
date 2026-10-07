import { toolCategory, type ToolCategory } from "./activity";
import type { TaskEvent } from "./tasks";

/** 一条审批要你确认什么，取自它的 `approval.requested` 事件。 */
export interface ApprovalInfo {
  /** What the approval is for (`ApprovalSubject.kind`): tool_call, profile_switch, plan_change, ...; empty in older events. */
  readonly kind: string;
  /** The node it concerns, when the event names one (a profile switch does). */
  readonly nodeId: string;
  /** The team member that asked (`ApprovalSubject.role`); empty for an approval nobody in a team raised. */
  readonly role: string;
  /** What a person called that member (`ApprovalSubject.role_label`); empty when the event has none. */
  readonly roleLabel: string;
  readonly tool: string;
  /** 调用带的参数：命令、路径。 */
  readonly detail: string;
  /** 「总是允许」会允许什么：工具名和命令前缀或路径规则；没有就不能总是允许。 */
  readonly rule: { readonly tool: string; readonly content: string | null } | null;
  /** How risky the operation looks (`ApprovalSubject.risk`): low, medium or high; empty when the event has none. */
  readonly risk: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A member's approval summary starts with `<role>:` (the stage adds it); the role is shown on its own, so it is not said twice. */
const withoutRolePrefix = (summary: string, role: string): string => {
  if (role === "") return summary;
  for (const prefix of [`${role}: `, `${role}:`, `${role}：`]) if (summary.startsWith(prefix)) return summary.slice(prefix.length);
  return summary;
};

export function approvalInfos(events: readonly TaskEvent[]): Readonly<Record<string, ApprovalInfo>> {
  const infos: Record<string, ApprovalInfo> = {};
  for (const event of events) {
    if (event.type !== "approval.requested") continue;
    const subject = (event.payload.subject ?? {}) as Record<string, unknown>;
    const rule = subject.allow_rule as Record<string, unknown> | null | undefined;
    infos[text(event.payload.approval_id)] = {
      kind: text(subject.kind),
      nodeId: text(event.payload.node_id),
      role: text(subject.role),
      roleLabel: text(subject.role_label),
      tool: withoutRolePrefix(text(subject.summary), text(subject.role)),
      detail: text(subject.detail),
      risk: ["low", "medium", "high"].includes(text(subject.risk)) ? text(subject.risk) : "",
      rule: rule ? { tool: text(rule.tool_name), content: typeof rule.rule_content === "string" ? rule.rule_content : null } : null,
    };
  }
  return infos;
}

/** 规则的一句话：`Bash: printf:*`；没有限定内容就是这个工具的所有调用。 */
export const ruleText = (rule: NonNullable<ApprovalInfo["rule"]>): string => (rule.content ? `${rule.tool}: ${rule.content}` : `${rule.tool}（所有调用）`);

// ---- 对话里的标记和停靠卡的标题 ----------------------------------------------------------------------------------------------

export type ApprovalState = "pending" | "approved" | "rejected" | "cancelled";

/** 一条审批现在的样子：等你的、你允许/拒绝了的、被取消（或被接管带走）的；事件里没见过结果、快照也没列出的返回 null。 */
export function approvalState(id: string, pending: readonly string[], outcomes: Readonly<Record<string, string>>): ApprovalState | null {
  const outcome = outcomes[id];
  if (outcome === "APPROVED") return "approved";
  if (outcome === "REJECTED") return "rejected";
  if (outcome === "CANCELLED" || outcome === "TAKEN_OVER") return "cancelled";
  return pending.includes(id) ? "pending" : null;
}

const TOOL_TITLES: Readonly<Partial<Record<ToolCategory, string>>> = { command: "运行命令", edit: "修改文件", create: "创建文件", read: "读取文件", list: "列出目录", search: "搜索", web: "访问网页", skill: "加载技能" };

/** 这条审批要你批准什么，一句话：工具调用按工具说（运行命令、修改文件），计划/流程里的步骤用它自己的标题，切换专家说切到谁。 */
export function approvalTitle(info: ApprovalInfo | undefined, nameOf: (ref: string) => string = (ref) => ref): string {
  if (!info) return "需要你的确认";
  if (info.kind === "profile_switch") return `切换专家：${nameOf(info.detail)}`;
  if (info.kind === "node_approval" || info.kind === "sop_step") return info.tool || (info.kind === "sop_step" ? "流程里的一步需要你批准" : "计划里的一步需要你批准");
  if (info.tool === "") return "需要你的确认";
  return TOOL_TITLES[toolCategory(info.tool)] ?? `使用 ${info.tool}`;
}

/** 标记行里标题后面跟的一小段：命令或路径的第一行。 */
export const approvalGist = (info: ApprovalInfo | undefined): string => (info?.kind === "tool_call" || info?.kind === "" ? (info.detail.split("\n")[0] ?? "").trim() : "");

/** 「总是允许」会免掉什么，一句话：Bash 的 `printf:*` 是「以 printf 开头的命令不再询问」。 */
export function alwaysHint(rule: NonNullable<ApprovalInfo["rule"]>): string {
  if (!rule.content) return `${rule.tool} 的所有调用都不再询问`;
  if (rule.tool === "Bash" || rule.tool === "PowerShell") {
    return rule.content.endsWith(":*") ? `以 ${rule.content.slice(0, -2)} 开头的命令不再询问` : `命令 ${rule.content} 不再询问`;
  }
  return `${rule.tool}：${rule.content} 不再询问`;
}
