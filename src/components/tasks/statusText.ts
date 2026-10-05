import type { Tone } from "../../ui/StatusBadge";

export const taskStatusText: Readonly<Record<string, string>> = {
  CREATED: "已创建", PLANNING: "规划中", RUNNING: "执行中", WAITING: "等待中", PAUSED: "已暂停",
  PAUSED_NEEDS_REVIEW: "需要复核", TAKEN_OVER: "人工接管", COMPLETED: "空闲", FAILED: "失败", CANCELLED: "已取消",
};

export const attemptStatusText: Readonly<Record<string, string>> = {
  running: "运行中", parked_approval: "等待审批", parked_input: "等待回复",
  completed: "已完成", failed: "失败", cancelled: "已停止",
};

/** 失败原因的分类（contract v3 的 failure_class）。没收录的显示原值。 */
export const failureClassText: Readonly<Record<string, string>> = {
  transient: "临时故障", model: "模型出错", tool: "工具出错", policy: "被策略拒绝",
  budget: "预算用尽", verification: "校验未通过", lost: "执行中断",
};

/** 计划变更被拒绝的原因码（plan.change_rejected 的 code）。 */
export const planRejectionText: Readonly<Record<string, string>> = {
  VERSION_CONFLICT: "计划刚被改动", FROZEN_NODE: "涉及已冻结的步骤", TYPE_NOT_ALLOWED: "步骤类型不允许", POLICY_DENIED: "被策略拒绝",
  BUDGET_EXCEEDED: "超出预算", CYCLE: "依赖成环", DEPTH_EXCEEDED: "层级太深", TOO_MANY_OPS: "计划太大", VISIBILITY: "没有权限",
  SCHEMA_INVALID: "格式不对", STALE_ATTEMPT: "执行已过期",
};

export const nodeStatusText: Readonly<Record<string, string>> = {
  PENDING: "待执行", READY: "就绪", RUNNING: "执行中", WAITING: "等待中", BLOCKED: "已阻塞",
  AWAITING_APPROVAL: "等待审批", AWAITING_INPUT: "等待回复", VERIFYING: "校验中", RETRY_PENDING: "待重试",
  CANCELLING: "取消中", COMPLETED: "已完成", FAILED: "失败", CANCELLED: "已取消", SKIPPED: "已跳过",
};

export const nodeTypeText: Readonly<Record<string, string>> = { agent_turn: "Agent 回合" };

/** 事件类型的中文名。没收录的类型显示原始类型，不会丢信息。 */
export const eventTypeText: Readonly<Record<string, string>> = {
  "task.created": "任务已创建",
  "task.status_changed": "任务状态变化",
  "message.user": "你的消息",
  "message.agent_final": "Agent 最终回复",
  "attempt.started": "尝试开始",
  "attempt.finished": "尝试结束",
  "attempt.parked": "尝试暂停等待",
  "attempt.resumed": "尝试已恢复",
  "node.status_changed": "节点状态变化",
  "tool.call_started": "工具调用开始",
  "tool.call_finished": "工具调用结束",
  "artifact.manifest_created": "成果物已生成",
  "task.completed": "本轮已完成",
  "budget.exhausted": "预算用尽",
  "budget.granted": "已追加预算",
  "usage.recorded": "用量记录",
  "profile.switched": "专家已切换",
};

/** 任务、节点、尝试的状态归到同一套颜色：进行中蓝、等待黄、完成绿、失败红、其余灰。 */
export function statusTone(status: string): Tone {
  const key = status.toUpperCase();
  if (["RUNNING", "PLANNING", "READY"].includes(key)) return "info";
  if (["WAITING", "PAUSED", "PAUSED_NEEDS_REVIEW", "TAKEN_OVER", "PARKED_APPROVAL", "PARKED_INPUT", "BLOCKED"].includes(key)) return "warning";
  if (key === "COMPLETED") return "success";
  if (key === "FAILED") return "danger";
  return "neutral";
}

export const isLive = (status: string) => ["RUNNING", "PLANNING"].includes(status.toUpperCase());

export function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
