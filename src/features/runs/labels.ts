import type { S } from "../../api/types";
export const runStateLabels = { queued: "排队中", running: "运行中", waiting_input: "等待输入", waiting_approval: "等待审批", paused: "已暂停", succeeded: "已完成", failed: "失败", cancelled: "已取消", budget_exhausted: "预算已用完", timed_out: "已超时" } as const satisfies Record<S["RunState"], string>;
export const endReasonLabels = { completed: "已完成", iteration_cap: "达到迭代上限", wall_cap: "达到时长上限", effect_boundary: "外部写入边界", budget_soft: "预算软限制", cancel: "已取消", goal_continue: "继续目标", compacted: "上下文已压缩", tool_approval: "等待工具审批", ask_user: "等待用户输入", effect_uncertain: "副作用待确认", agent_error: "专家错误", model_error: "模型错误", loop_detected: "检测到循环", sandbox_error: "沙箱错误", tool_policy_error: "工具策略错误", run_terminated: "运行已终止" } as const satisfies Record<NonNullable<S["Segment"]["end_reason"]>, string>;
export const segmentStateLabels = { running: "运行中", completed: "已完成", interrupted: "已中断", yielded: "已让出", failed: "失败" } as const satisfies Record<S["Segment"]["status"], string>;
export const effectStateLabels = { started: "已开始", completed: "已完成", failed: "失败", unknown: "结果未知" } as const satisfies Record<S["RunEffect"]["status"], string>;
export const interactionStateLabels = { pending: "待处理", escalated: "已升级", resolving: "处理中", resolved: "已解决", expired: "已过期", cancelled: "已取消" } as const satisfies Record<S["Interaction"]["status"], string>;
type RunTrigger = "user_message" | "schedule" | "api" | "channel" | "resume";
export const triggerLabels = { user_message: "用户消息", schedule: "定时任务", api: "接口调用", channel: "渠道", resume: "恢复" } as const satisfies Record<RunTrigger, string>;
