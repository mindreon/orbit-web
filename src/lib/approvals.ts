import type { TaskEvent } from "./tasks";

/** 一条审批要你确认什么，取自它的 `approval.requested` 事件。 */
export interface ApprovalInfo {
  readonly tool: string;
  /** 调用带的参数：命令、路径。 */
  readonly detail: string;
  /** 「总是允许」会允许什么：工具名和命令前缀或路径规则；没有就不能总是允许。 */
  readonly rule: { readonly tool: string; readonly content: string | null } | null;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function approvalInfos(events: readonly TaskEvent[]): Readonly<Record<string, ApprovalInfo>> {
  const infos: Record<string, ApprovalInfo> = {};
  for (const event of events) {
    if (event.type !== "approval.requested") continue;
    const subject = (event.payload.subject ?? {}) as Record<string, unknown>;
    const rule = subject.allow_rule as Record<string, unknown> | null | undefined;
    infos[text(event.payload.approval_id)] = {
      tool: text(subject.summary),
      detail: text(subject.detail),
      rule: rule ? { tool: text(rule.tool_name), content: typeof rule.rule_content === "string" ? rule.rule_content : null } : null,
    };
  }
  return infos;
}

/** 规则的一句话：`Bash: printf:*`；没有限定内容就是这个工具的所有调用。 */
export const ruleText = (rule: NonNullable<ApprovalInfo["rule"]>): string => (rule.content ? `${rule.tool}: ${rule.content}` : `${rule.tool}（所有调用）`);
