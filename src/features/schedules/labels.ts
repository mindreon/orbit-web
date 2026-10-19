import type { S } from "../../api/types";
export const scheduleStatusLabels = { active: "启用", paused: "已暂停", deleted: "已删除" } satisfies Record<S["Schedule"]["status"], string>;
export const scheduleRunLabels = { running: "运行中", succeeded: "已完成", failed: "失败", cancelled: "已取消", budget_exhausted: "预算耗尽", timed_out: "超时", skipped: "已跳过" } satisfies Record<S["ScheduleRun"]["status"], string>;
export const overlapLabels = { skip: "跳过本次", buffer_one: "保留一次待运行" } satisfies Record<S["ScheduleCreate"]["overlap_policy"], string>;
