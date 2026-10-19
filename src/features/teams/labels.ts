import type { S } from "../../api/types";
export const taskStatusLabels = { pending: "待开始", blocked: "等待依赖", in_progress: "进行中", in_review: "评审中", completed: "已完成", cancelled: "已取消", failed: "失败" } as const satisfies Record<S["TaskStatus"], string>;
export const memberStatusLabels = { idle: "空闲", working: "工作中", waiting_input: "等待输入", waiting_approval: "等待审批", finished: "已结束" } as const satisfies Record<S["TeamMemberView"]["status"], string>;
export const roleLabels = { leader: "负责人", teammate: "成员", reviewer: "评审" } as const satisfies Record<S["TeamRole"], string>;
export const verdictLabels = { approve: "通过", reject: "驳回" } as const satisfies Record<S["Verdict"], string>;
