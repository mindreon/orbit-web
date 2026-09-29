import { describe, expect, it } from "vitest";
import { applyEvent, emptyLiveState, markStreamGap, mergeEvent, type TaskLiveState } from "./taskEvents";
import type { TaskEvent } from "./tasks";

let counter = 0;

/** A durable event has a seq; an ephemeral one has seq 0 and `after_seq`. `version` is the entity version (0 = unversioned). */
function event(
  type: string,
  payload: Record<string, unknown>,
  opts: { seq?: number; after_seq?: number; id?: string; entity?: [string, string, number] } = {},
): TaskEvent {
  counter += 1;
  const entity = opts.entity ? { kind: opts.entity[0], id: opts.entity[1], version: opts.entity[2] } : undefined;
  return {
    seq: opts.seq ?? 0,
    ...(opts.after_seq === undefined ? {} : { after_seq: opts.after_seq }),
    event_id: opts.id ?? `evt_${counter}`,
    task_id: "task_1",
    type,
    source: "workflow",
    payload,
    occurred_at: "2026-09-30T00:00:00Z",
    ...(entity ? { entity } : {}),
  };
}

const fold = (events: readonly TaskEvent[], from: TaskLiveState = emptyLiveState) => events.reduce(applyEvent, from);
const started = (attemptId: string, seq: number, version = 1) =>
  event("attempt.started", { attempt_id: attemptId, node_id: "n1", attempt_no: 1 }, { seq, entity: ["attempt", attemptId, version] });

describe("attempt timeline folding", () => {
  it("adds a running attempt on attempt.started and reads attempt_no", () => {
    const state = fold([event("attempt.started", { attempt_id: "a1", node_id: "n1", attempt_no: 2 }, { seq: 1 })]);
    expect(state.attempts).toEqual([{ attemptId: "a1", nodeId: "n1", attemptNo: 2, status: "running", resumed: 0 }]);
  });

  it("defaults attempt_no to 1 and missing string fields to empty", () => {
    const state = fold([event("attempt.started", {}, { seq: 1 })]);
    expect(state.attempts[0]).toMatchObject({ attemptId: "", nodeId: "", attemptNo: 1 });
  });

  it("parks for approval, then resumes and counts the resume", () => {
    const state = fold([
      started("a1", 1),
      event("attempt.parked", { attempt_id: "a1", reason: "approval" }, { seq: 2, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]?.status).toBe("parked_approval");
    expect(state.question).toBeNull();

    const resumed = fold([event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 3] })], state);
    expect(resumed.attempts[0]).toMatchObject({ status: "running", resumed: 1 });
  });

  it("parks for input with the agent's question and clears it when the attempt resumes", () => {
    const parked = fold([
      started("a1", 1),
      event("attempt.parked", { attempt_id: "a1", reason: "input", question: "Which file?" }, { seq: 2, entity: ["attempt", "a1", 2] }),
    ]);
    expect(parked.attempts[0]?.status).toBe("parked_input");
    expect(parked.question).toEqual({ attemptId: "a1", text: "Which file?" });

    const resumed = fold([event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 3] })], parked);
    expect(resumed.question).toBeNull();
  });

  it("keeps another attempt's question when a different attempt resumes or finishes", () => {
    const state = fold([
      started("a1", 1),
      started("a2", 2),
      event("attempt.parked", { attempt_id: "a1", reason: "input", question: "?" }, { seq: 3, entity: ["attempt", "a1", 2] }),
      event("attempt.resumed", { attempt_id: "a2" }, { seq: 4, entity: ["attempt", "a2", 2] }),
      event("attempt.finished", { attempt_id: "a2", outcome: "completed" }, { seq: 5, entity: ["attempt", "a2", 3] }),
    ]);
    expect(state.question).toEqual({ attemptId: "a1", text: "?" });
  });

  it.each([
    ["completed", "completed"],
    ["cancelled", "cancelled"],
    ["failed", "failed"],
    ["anything else", "failed"],
    ["", "failed"],
  ])("maps outcome %j to status %s and drops the attempt's live text", (outcome, status) => {
    const state = fold([
      started("a1", 1),
      event("agent.token_delta", { attempt_id: "a1", text: "partial" }, { after_seq: 1 }),
      event("attempt.finished", { attempt_id: "a1", outcome }, { seq: 2, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]?.status).toBe(status);
    expect(state.live).toEqual({});
    expect(state.truncated).toEqual({});
  });

  it("clears the question of a finishing attempt", () => {
    const state = fold([
      started("a1", 1),
      event("attempt.parked", { attempt_id: "a1", reason: "input", question: "?" }, { seq: 2, entity: ["attempt", "a1", 2] }),
      event("attempt.finished", { attempt_id: "a1", outcome: "cancelled" }, { seq: 3, entity: ["attempt", "a1", 3] }),
    ]);
    expect(state.question).toBeNull();
  });

  it("ignores events for an attempt it never saw started, and unknown event types", () => {
    const state = fold([
      event("attempt.finished", { attempt_id: "ghost", outcome: "completed" }, { seq: 1, entity: ["attempt", "ghost", 1] }),
      event("task.status_changed", { to_status: "RUNNING" }, { seq: 2 }),
    ]);
    expect(state.attempts).toEqual([]);
  });

  it("stores the final message on its attempt and drops the streamed text", () => {
    const state = fold([
      started("a1", 1),
      event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 }),
      event("message.agent_final", { attempt_id: "a1", text: "Hello" }, { seq: 2, entity: ["attempt", "a1", 0] }),
    ]);
    expect(state.attempts[0]?.finalText).toBe("Hello");
    expect(state.live).toEqual({});
  });

  it("does not mutate the state it was given", () => {
    const before = fold([started("a1", 1)]);
    const snapshot = JSON.stringify(before);
    applyEvent(before, event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 2, entity: ["attempt", "a1", 2] }));
    applyEvent(before, event("agent.token_delta", { attempt_id: "a1", text: "x" }, { after_seq: 1 }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("entity.version merging (09 §1)", () => {
  it("ignores an event whose version is not newer than the one already applied", () => {
    const state = fold([
      started("a1", 1, 1),
      event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 2, entity: ["attempt", "a1", 3] }),
      // seq is projection order, not causal order: this older resume arrives after the newer finish.
      event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]).toMatchObject({ status: "completed", resumed: 0 });
  });

  it("ignores a replay of the same version", () => {
    const resume = event("attempt.resumed", { attempt_id: "a1" }, { seq: 2, entity: ["attempt", "a1", 2] });
    const state = fold([started("a1", 1, 1), resume, { ...resume, event_id: "evt_other" }]);
    expect(state.attempts[0]?.resumed).toBe(1);
  });

  it("does not let an old version undo a question that a newer park set", () => {
    const state = fold([
      started("a1", 1, 1),
      event("attempt.parked", { attempt_id: "a1", reason: "input", question: "Which file?" }, { seq: 2, entity: ["attempt", "a1", 3] }),
      event("attempt.parked", { attempt_id: "a1", reason: "approval" }, { seq: 3, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]?.status).toBe("parked_input");
    expect(state.question?.text).toBe("Which file?");
  });

  it("versions each entity separately", () => {
    const state = fold([
      started("a1", 1, 5),
      started("a2", 2, 1),
      event("attempt.resumed", { attempt_id: "a2" }, { seq: 3, entity: ["attempt", "a2", 2] }),
    ]);
    expect(state.attempts.map((a) => a.resumed)).toEqual([0, 1]);
  });

  it("applies version 0 (unversioned worker events) every time and never advances the version", () => {
    const first = event("message.agent_final", { attempt_id: "a1", text: "one" }, { seq: 2, entity: ["attempt", "a1", 0] });
    const second = event("message.agent_final", { attempt_id: "a1", text: "two" }, { seq: 3, entity: ["attempt", "a1", 0] });
    const state = fold([started("a1", 1, 1), first, second]);
    expect(state.attempts[0]?.finalText).toBe("two");
    expect(state.versions["attempt:a1"]).toBe(1);
    // A versioned event right after still applies: version 0 did not raise the mark.
    const resumed = applyEvent(state, event("attempt.resumed", { attempt_id: "a1" }, { seq: 4, entity: ["attempt", "a1", 2] }));
    expect(resumed.attempts[0]?.resumed).toBe(1);
  });

  it("applies events without an entity", () => {
    const state = fold([event("attempt.started", { attempt_id: "a1", node_id: "n1" }, { seq: 1 })]);
    expect(state.attempts).toHaveLength(1);
    expect(state.versions).toEqual({});
  });

  it("gives the same state for every arrival order after mergeEvent", () => {
    const log = [
      started("a1", 1, 1),
      event("attempt.parked", { attempt_id: "a1", reason: "approval" }, { seq: 2, entity: ["attempt", "a1", 2] }),
      event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 3] }),
      event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 4, entity: ["attempt", "a1", 4] }),
    ];
    const expected = fold(log);
    const arrivals = [[3, 1, 0, 2], [2, 3, 1, 0], [0, 1, 2, 3, 2, 1]];
    for (const order of arrivals) {
      const merged = order.reduce<readonly TaskEvent[]>((acc, index) => mergeEvent(acc, log[index] as TaskEvent), []);
      expect(fold(merged)).toEqual(expected);
    }
  });
});

describe("ephemeral streamed text and the truncation mark", () => {
  it("concatenates token deltas per attempt", () => {
    const state = fold([
      event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 }),
      event("agent.token_delta", { attempt_id: "a2", text: "X" }, { after_seq: 1 }),
      event("agent.token_delta", { attempt_id: "a1", text: "lo" }, { after_seq: 1 }),
    ]);
    expect(state.live).toEqual({ a1: "Hello", a2: "X" });
  });

  it("marks attempts that were streaming when the stream dropped as truncated", () => {
    const streaming = fold([event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 })]);
    expect(markStreamGap(streaming).truncated).toEqual({ a1: true });
  });

  it("returns the same state when nothing is streaming", () => {
    expect(markStreamGap(emptyLiveState)).toBe(emptyLiveState);
    const empty = { ...emptyLiveState, live: { a1: "" } };
    expect(markStreamGap(empty)).toBe(empty);
  });

  it("keeps earlier truncation marks and adds new ones", () => {
    const state = markStreamGap({ ...emptyLiveState, live: { a2: "text" }, truncated: { a1: true } });
    expect(state.truncated).toEqual({ a1: true, a2: true });
  });

  it("clears the mark when the final message arrives", () => {
    const gapped = markStreamGap(
      fold([started("a1", 1), event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 })]),
    );
    const done = applyEvent(gapped, event("message.agent_final", { attempt_id: "a1", text: "Hello" }, { seq: 2, entity: ["attempt", "a1", 0] }));
    expect(done.truncated).toEqual({});
    expect(done.live).toEqual({});
  });

  it("clears the mark when the attempt finishes without a final message", () => {
    const gapped = markStreamGap(
      fold([started("a1", 1), event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 })]),
    );
    const done = applyEvent(gapped, event("attempt.finished", { attempt_id: "a1", outcome: "failed" }, { seq: 2, entity: ["attempt", "a1", 2] }));
    expect(done.truncated).toEqual({});
  });
});

describe("mergeEvent", () => {
  it("orders durable events by seq whatever order they arrive in", () => {
    const merged = [event("a", {}, { seq: 3 }), event("b", {}, { seq: 1 }), event("c", {}, { seq: 2 })].reduce<readonly TaskEvent[]>(
      mergeEvent,
      [],
    );
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("puts an ephemeral event right after the durable event it follows, before the next one", () => {
    const merged = [
      event("d3", {}, { seq: 3 }),
      event("e", {}, { after_seq: 2 }),
      event("d2", {}, { seq: 2 }),
      event("d1", {}, { seq: 1 }),
    ].reduce<readonly TaskEvent[]>(mergeEvent, []);
    expect(merged.map((e) => e.type)).toEqual(["d1", "d2", "e", "d3"]);
  });

  it("puts an ephemeral event without after_seq at the very start", () => {
    const merged = [event("d1", {}, { seq: 1 }), event("e", {})].reduce<readonly TaskEvent[]>(mergeEvent, []);
    expect(merged.map((e) => e.type)).toEqual(["e", "d1"]);
  });

  it("keeps ephemeral events that follow the same durable event in arrival order", () => {
    const merged = [
      event("d1", {}, { seq: 1 }),
      event("t1", {}, { after_seq: 1 }),
      event("t2", {}, { after_seq: 1 }),
      event("t3", {}, { after_seq: 1 }),
    ].reduce<readonly TaskEvent[]>(mergeEvent, []);
    expect(merged.map((e) => e.type)).toEqual(["d1", "t1", "t2", "t3"]);
  });

  it("drops a replayed durable event (same event_id) after a reconnect and returns the same log", () => {
    const first = event("attempt.started", { attempt_id: "a1" }, { seq: 1 });
    const log = mergeEvent([], first);
    expect(mergeEvent(log, { ...first })).toBe(log);
  });

  it("drops a durable event whose seq is already in the log, even under a new event_id", () => {
    const log = mergeEvent([], event("attempt.started", { attempt_id: "a1" }, { seq: 4, id: "evt_a" }));
    expect(mergeEvent(log, event("attempt.started", { attempt_id: "a1" }, { seq: 4, id: "evt_b" }))).toBe(log);
  });

  it("keeps ephemeral events that share seq 0 but have different ids", () => {
    const merged = [event("e1", {}, { after_seq: 1 }), event("e2", {}, { after_seq: 1 })].reduce<readonly TaskEvent[]>(mergeEvent, []);
    expect(merged).toHaveLength(2);
  });

  it("replaying the whole durable log after a reconnect does not change the folded state", () => {
    const log = [
      started("a1", 1),
      event("attempt.parked", { attempt_id: "a1", reason: "approval" }, { seq: 2, entity: ["attempt", "a1", 2] }),
      event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 3] }),
    ];
    const once = log.reduce<readonly TaskEvent[]>(mergeEvent, []);
    const twice = log.reduce<readonly TaskEvent[]>(mergeEvent, once);
    expect(twice).toEqual(once);
    expect(fold(twice)).toEqual(fold(once));
  });

  it("does not mutate the input log", () => {
    const log: readonly TaskEvent[] = [event("a", {}, { seq: 2 })];
    const copy = [...log];
    mergeEvent(log, event("b", {}, { seq: 1 }));
    expect(log).toEqual(copy);
  });
});
