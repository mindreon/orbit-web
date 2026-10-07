import { describe, expect, it } from "vitest";
import { describeStep, isResultCut, RESULT_PREVIEW_CHARS } from "./activity";

const titles: Record<string, string> = { n_1: "导航栏 + Hero 首页" };
const titleOf = (id: string) => titles[id];
const update = (args: Record<string, unknown>) => describeStep({ tool: "TaskUpdate", args: JSON.stringify(args) }, "success", titleOf).text;

describe("TaskUpdate rows", () => {
  it("names the task by its plan title and says what changed (T1)", () => {
    expect(update({ task_id: "n_1", add_blocked_by: ["n_0"] })).toBe("已更新任务 导航栏 + Hero 首页（设置依赖）");
    expect(update({ task_id: "n_1", status: "in_progress" })).toBe("已更新任务 导航栏 + Hero 首页（进行中）");
    expect(update({ task_id: "n_1", owner: "hooly" })).toBe("已更新任务 导航栏 + Hero 首页（指派给 hooly）");
  });

  it("prefers the call's own subject over the plan's title (T1)", () => {
    expect(update({ task_id: "n_1", subject: "新标题" })).toBe("已更新任务 新标题");
  });

  it("reads a call cut off mid-way, and never shows the raw id when there is no title (T1)", () => {
    expect(describeStep({ tool: "TaskUpdate", args: '{"task_id": "n_9", "add_blocked_by": ["n_' }, "success", titleOf).text).toBe("已更新任务（设置依赖）");
    expect(describeStep({ tool: "TaskUpdate", args: '{"task_id": "n_9"}' }, "success").text).toBe("已更新任务");
  });

  it("keeps the same wording while running and when it failed (T1)", () => {
    expect(describeStep({ tool: "TaskUpdate", args: '{"task_id":"n_1","status":"completed"}' }, "running", titleOf).text).toBe("正在更新任务 导航栏 + Hero 首页（已完成）");
    expect(describeStep({ tool: "TaskUpdate", args: '{"task_id":"n_1","status":"completed"}' }, "error", titleOf).text).toBe("更新任务失败 导航栏 + Hero 首页（已完成）");
  });
});

describe("a cut result", () => {
  it("is recognised when it fills the runtime's whole preview (R1)", () => {
    expect(isResultCut("a".repeat(RESULT_PREVIEW_CHARS))).toBe(true);
    expect(isResultCut("a".repeat(RESULT_PREVIEW_CHARS - 1))).toBe(false);
    expect(isResultCut("")).toBe(false);
  });
});
