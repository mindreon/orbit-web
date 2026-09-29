export const taskStatusText: Readonly<Record<string, string>> = {
  CREATED: "已创建", PLANNING: "规划中", RUNNING: "执行中", WAITING: "等待中", PAUSED: "已暂停",
  PAUSED_NEEDS_REVIEW: "需要复核", TAKEN_OVER: "人工接管", COMPLETED: "已完成", FAILED: "失败", CANCELLED: "已取消",
};

export const attemptStatusText: Readonly<Record<string, string>> = {
  running: "运行中", parked_approval: "等待审批", parked_input: "等待回复",
  completed: "已完成", failed: "失败", cancelled: "已打断",
};
