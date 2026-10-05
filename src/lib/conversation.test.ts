import { describe, expect, it } from "vitest";
import { buildTimeline } from "./conversation";
import { applyEvent, emptyLiveState } from "./taskEvents";
import type { Task, TaskEvent } from "./tasks";

/**
 * Ways the conversation can attribute a reply wrongly, each asserted below:
 *   V1 a reply does not know the node it came from, so a member's reply cannot be told from the leader's
 *   V2 a reply of a second attempt takes the node of the first
 */
const task = { task_id: "t", goal: "g", created_at: "2026-10-05T00:00:00Z" } as Task;
const event = (seq: number, type: string, payload: Record<string, unknown>): TaskEvent => ({ seq, event_id: `e${seq}`, task_id: "t", type, source: "workflow", payload, occurred_at: "2026-10-05T00:00:00Z" });

describe("buildTimeline", () => {
  it("gives each reply the node its attempt runs (V1, V2)", () => {
    const events = [
      event(1, "attempt.started", { attempt_id: "att_1", node_id: "n_leader", attempt_no: 1 }),
      event(2, "attempt.finished", { attempt_id: "att_1", outcome: "completed" }),
      event(3, "attempt.started", { attempt_id: "att_2", node_id: "n_member", attempt_no: 1 }),
      event(4, "message.agent_final", { attempt_id: "att_2", text: "done" }),
    ];
    const live = events.reduce(applyEvent, emptyLiveState);
    const turns = buildTimeline(task, events, live).filter((turn) => turn.kind === "agent");
    expect(turns.map((turn) => (turn.kind === "agent" ? turn.nodeId : ""))).toEqual(["n_leader", "n_member"]);
  });
});
