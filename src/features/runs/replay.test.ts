import { expect, it } from "vitest";
import type { S } from "../../api/types";
import { endReasonLabels, triggerLabels } from "./labels";
import { groupCosts } from "./costs";

it("U5 maps exactly the stored run triggers to Chinese labels", () => {
  // Run.trigger is a plain string in OpenAPI, so compare against the DB literal set.
  expect(Object.keys(triggerLabels).sort()).toEqual(["user_message", "schedule", "api", "channel", "resume"].sort());
  expect(triggerLabels).toEqual({ user_message: "用户消息", schedule: "定时任务", api: "接口调用", channel: "渠道", resume: "恢复" });
});
it("maps every segment end reason, including approval and external-write boundaries", () => {
  const reasons: NonNullable<S["Segment"]["end_reason"]>[] = ["completed", "iteration_cap", "wall_cap", "effect_boundary", "budget_soft", "cancel", "goal_continue", "compacted", "tool_approval", "ask_user", "effect_uncertain", "agent_error", "model_error", "loop_detected", "sandbox_error", "tool_policy_error", "run_terminated"];
  expect(Object.keys(endReasonLabels).sort()).toEqual(reasons.sort());
  expect(endReasonLabels.tool_approval).toBe("等待工具审批");
  expect(endReasonLabels.effect_boundary).toBe("外部写入边界");
  expect(endReasonLabels.completed).toBe("已完成");
});
it("groups cost by member × model × meter, retaining exact quantity strings", () => {
  const item = { member: "writer-1", source: "model", model: "model-a", meter: "tokens.input", quantity: "9007199254740993.000", millicredits: 5 } as const;
  const groups = groupCosts([item, { ...item, segment: 2, quantity: "0.0100", millicredits: 2 }, { ...item, member: "writer-2" }, { ...item, model: "model-b" }, { ...item, meter: "tokens.output" }]);
  expect(groups).toHaveLength(4);
  expect(groups[0].quantities).toEqual(["9007199254740993.000", "0.0100"]);
  expect(groups[0].total).toBe("9007199254740993.01");
  expect(groups[0].millicredits).toBe(7);
});
