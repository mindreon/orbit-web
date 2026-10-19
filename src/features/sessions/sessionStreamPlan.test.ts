import { expect, it, vi } from "vitest";
import type { TypedRunEvent } from "../../api/events";
import { sessionStreamPlan } from "./sessionStreamPlan";
it("U6 takes the minimum cursor without losing large sequence precision, and omits it for empty sessions", async () => {
  const history = vi.fn(async (id: string) => ({ events: [], resumeFrom: id === "a" ? "9007199254740993" : "9007199254740992" }));
  const plan = sessionStreamPlan(history);
  expect(await plan.rebuild(["a", "b"])).toBe("9007199254740992");
  expect(await plan.rebuild([])).toBeUndefined();
});
it("U6 rebuilds once after expiry, makes consecutive expiry fatal, and creates unknown runs locally", async () => {
  const plan = sessionStreamPlan(async () => ({ events: [], resumeFrom: "10" }));
  await plan.rebuild(["r"]);
  expect(await plan.expired(["r"])).toBe("10");
  await expect(plan.expired(["r"])).rejects.toThrow("连续过期");
  plan.receive({ id: "new:main:1:0:1", run_id: "new", type: "run.started", member: "main", segment: 1, attempt: 0, data: {} } as TypedRunEvent);
  expect(plan.snapshot().get("new")?.status).toBe("running");
  expect(await plan.expired(["r"])).toBe("10");
});
