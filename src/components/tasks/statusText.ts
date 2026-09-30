import type { Tone } from "../../ui/StatusBadge";

export const taskStatusText: Readonly<Record<string, string>> = {
  CREATED: "已创建", PLANNING: "规划中", RUNNING: "执行中", WAITING: "等待中", PAUSED: "已暂停",
  PAUSED_NEEDS_REVIEW: "需要复核", TAKEN_OVER: "人工接管", COMPLETED: "已完成", FAILED: "失败", CANCELLED: "已取消",
};

export const attemptStatusText: Readonly<Record<string, string>> = {
  running: "运行中", parked_approval: "等待审批", parked_input: "等待回复",
  completed: "已完成", failed: "失败", cancelled: "已打断",
};

export const nodeStatusText: Readonly<Record<string, string>> = {
  PENDING: "待执行", READY: "就绪", RUNNING: "执行中", WAITING: "等待中", BLOCKED: "已阻塞",
  COMPLETED: "已完成", FAILED: "失败", CANCELLED: "已取消", SKIPPED: "已跳过",
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
  "task.completed": "任务已完成",
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
