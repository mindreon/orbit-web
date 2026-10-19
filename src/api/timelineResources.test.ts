import { describe, expect, it } from "vitest";
import { emptyRunStream, reduceRunEvent, type RunEventLike } from "./timeline";
const event = (n: number, type: string, data: Record<string, unknown>, attempt = 0): RunEventLike => ({ id: `run:main:1:${attempt}:${n}`, type, data, member: "main", segment: 1, attempt });
const fold = (events: RunEventLike[]) => events.reduce(reduceRunEvent, emptyRunStream);
describe("timeline resources", () => {
  it("merges call/result/output and retains only the last 64 KiB of UTF-8 output", () => {
    const state = fold([event(1, "tool.call", { call_id: "c", tool: "read" }), event(2, "sandbox.output", { call_id: "c", stream: "stdout", text: "前".repeat(30000) }), event(3, "tool.result", { call_id: "c", ok: true, preview: "done" })]);
    expect(state.tools.get("c")).toMatchObject({ call: { tool: "read" }, result: { ok: true } });
    expect(new TextEncoder().encode(state.tools.get("c")!.output).length).toBeLessThanOrEqual(65536);
    expect(state.tools.get("c")!.output).not.toContain("�");
  });
  it("replaces unfinished tools on a retry, preserving completed ones and removing stale order entries", () => {
    const state = fold([event(1, "tool.call", { call_id: "done", tool: "read" }), event(2, "tool.result", { call_id: "done", ok: true }), event(3, "tool.call", { call_id: "pending", tool: "wait" }), event(1, "segment.started", {}, 1)]);
    expect([...state.tools.keys()]).toEqual(["done"]);
    expect(state.order).toEqual([{ kind: "tool", key: "done" }]);
  });
  it("records interaction resolution, team signals, artifacts and latest usage", () => {
    const state = fold([event(1, "interaction.requested", { interaction: { interaction_id: "i", kind: "ask_user" }, expires_at: "soon" }), event(2, "interaction.resolved", { interaction_id: "i", decision: { kind: "ask_user", answer: "yes" }, actor: "p" }), event(3, "artifact.created", { artifact: { path: "a", digest: "old" } }), event(4, "artifact.updated", { artifact: { path: "a", digest: "new" } }), event(5, "team.task.created", {}), event(6, "team.message", { message_id: "tm", text: "hello" }), event(7, "usage.update", { cost_millicredits: 10 })]);
    expect(state.interactions.get("i")?.resolution?.actor).toBe("p");
    expect(state.artifacts).toEqual({ a: "new" });
    expect(state.teamSignal).toBe(2);
    expect(state.teamMessages[0].text).toBe("hello");
    expect(state.usage?.cost_millicredits).toBe(10);
  });
  it("does not regress terminal status after late run events", () => {
    expect(fold([event(1, "run.completed", { status: "succeeded" }), event(2, "run.status", { status: "running" }), event(3, "run.started", {})]).status).toBe("succeeded");
  });
  it("history [a,b] followed by SSE [b duplicate,c] matches live a,b,c", () => {
    const a = event(1, "message.final", { message_id: "a", text: "a" });
    const b = event(2, "tool.call", { call_id: "b", tool: "read" });
    const c = event(3, "interaction.requested", { interaction: { interaction_id: "c", kind: "ask_user" } });
    expect(fold([a, b, b, c]).order).toEqual(fold([a, b, c]).order);
    expect(fold([a, b, b, c]).order.map((item) => item.kind)).toEqual(["message", "tool", "interaction"]);
  });
});
