import type { S } from "../../api/types";
export const runStateLabels = { queued: "排队中", running: "运行中", waiting_input: "等待输入", waiting_approval: "等待审批", paused: "已暂停", succeeded: "已完成", failed: "失败", cancelled: "已取消", budget_exhausted: "预算已用完", timed_out: "已超时" } as const satisfies Record<S["RunState"], string>;
