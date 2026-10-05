import { describe, expect, it } from "vitest";
import { applyEvent, budgetAmounts, emptyLiveState, markStreamGap, mergeEvent, pendingSwitch, totalReserved, type TaskLiveState } from "./taskEvents";
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
    expect(state.attempts).toEqual([{ attemptId: "a1", nodeId: "n1", attemptNo: 2, status: "running", resumed: 0, marks: [] }]);
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

  it("keeps a structured output the attempt reports, and none when it reports nothing or an empty one", () => {
    const run = (output: unknown) => fold([started("a1", 1), event("attempt.finished", { attempt_id: "a1", outcome: "completed", output }, { seq: 2, entity: ["attempt", "a1", 2] })]).attempts[0];
    expect(run({ summary: "ok", count: 3 })?.output).toEqual({ summary: "ok", count: 3 });
    expect(run({})?.output).toBeUndefined();
    expect(run(undefined)?.output).toBeUndefined();
    expect(run([1])?.output).toBeUndefined();
  });

  it("marks an output that was too large to send, and keeps it apart from a real output", () => {
    const attempt = fold([started("a1", 1), event("attempt.finished", { attempt_id: "a1", outcome: "completed", output_truncated: true }, { seq: 2, entity: ["attempt", "a1", 2] })]).attempts[0];
    expect(attempt?.outputTruncated).toBe(true);
    expect(attempt?.output).toBeUndefined();
    const plain = fold([started("a1", 1), event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 2, entity: ["attempt", "a1", 2] })]).attempts[0];
    expect(plain?.outputTruncated).toBeUndefined();
  });

  it.each([
    ["completed", "completed"],
    ["cancelled", "cancelled"],
    ["failed", "failed"],
    ["anything else", "failed"],
    ["", "failed"],
  ])("maps outcome %j to status %s and keeps the attempt's streamed text for the conversation", (outcome, status) => {
    const state = fold([
      started("a1", 1),
      event("agent.token_delta", { attempt_id: "a1", text: "partial" }, { after_seq: 1 }),
      event("attempt.finished", { attempt_id: "a1", outcome }, { seq: 2, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]?.status).toBe(status);
    // live 保留：历史轮次（工具调用之间的话）只在 blocks 里，final 只覆盖最后一轮。
    expect(state.live["a1"]).toEqual([{ id: "", text: "partial" }]);
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

  it("stores the final message on its attempt and keeps the streamed blocks", () => {
    const state = fold([
      started("a1", 1),
      event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 }),
      event("message.agent_final", { attempt_id: "a1", text: "Hello" }, { seq: 2, entity: ["attempt", "a1", 0] }),
    ]);
    expect(state.attempts[0]?.finalText).toBe("Hello");
    expect(state.live["a1"]).toEqual([{ id: "", text: "Hel" }]);
  });

  it("marks a message.user boundary on the latest attempt with the block counts so far", () => {
    const state = fold([
      started("a1", 1),
      event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 }),
      event("message.user", { text: "1" }, { seq: 2 }),
    ]);
    expect(state.attempts[0]?.marks).toEqual([{ text: 1, thinking: 0 }]);

    // 已结束的尝试不拆：用户之后的新消息属于下一次 attempt.started。
    const after = fold([event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 3, entity: ["attempt", "a1", 2] }), event("message.user", { text: "再来" }, { seq: 4 })], state);
    expect(after.attempts[0]?.marks).toEqual([{ text: 1, thinking: 0 }]);
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

  it("applies an event stamped with the entity's current version (control's rewrite of a worker's version 0)", () => {
    const state = fold([
      started("a1", 1, 1),
      event("attempt.parked", { attempt_id: "a1", reason: "input", question: "Which file?" }, { seq: 2, entity: ["attempt", "a1", 2] }),
      // control gives the worker's attempt.resumed the version the attempt is at, here 2
      event("attempt.resumed", { attempt_id: "a1" }, { seq: 3, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]).toMatchObject({ status: "running", resumed: 1 });
    expect(state.question).toBeNull();
  });

  it("does not apply a replay of the same event twice (mergeEvent drops it by seq or event_id)", () => {
    const resume = event("attempt.resumed", { attempt_id: "a1" }, { seq: 2, entity: ["attempt", "a1", 2] });
    const log = [started("a1", 1, 1), resume, { ...resume, event_id: "evt_other" }].reduce(mergeEvent, [] as readonly TaskEvent[]);
    expect(log).toHaveLength(2);
    expect(fold(log).attempts[0]?.resumed).toBe(1);
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
    expect(state.live).toEqual({ a1: [{ id: "", text: "Hello" }], a2: [{ id: "", text: "X" }] });
  });

  it("streams thinking deltas per block, beside the live text", () => {
    const state = fold([
      event("agent.thinking_delta", { attempt_id: "a1", block_id: "t1", text: "先查" }, { after_seq: 1 }),
      event("agent.thinking_delta", { attempt_id: "a1", block_id: "t1", text: "账本" }, { after_seq: 1 }),
      event("agent.thinking_delta", { attempt_id: "a1", block_id: "t2", text: "再看报表" }, { after_seq: 1 }),
      event("agent.token_delta", { attempt_id: "a1", block_id: "b1", text: "答" }, { after_seq: 1 }),
    ]);
    expect(state.thinking).toEqual({ a1: [{ id: "t1", text: "先查账本" }, { id: "t2", text: "再看报表" }] });
    expect(state.live).toEqual({ a1: [{ id: "b1", text: "答" }] });
  });

  it("keeps the thinking after the final message arrives, so the panel survives the answer", () => {
    const state = fold([
      started("a1", 1),
      event("agent.thinking_delta", { attempt_id: "a1", block_id: "t1", text: "想" }, { after_seq: 1 }),
      event("message.agent_final", { attempt_id: "a1", text: "答" }, { seq: 2, entity: ["attempt", "a1", 0] }),
    ]);
    expect(state.attempts[0]?.finalText).toBe("答");
    expect(state.thinking).toEqual({ a1: [{ id: "t1", text: "想" }] });
    expect(state.live).toEqual({});
  });

  it("marks a thinking-only attempt as truncated when the stream drops", () => {
    const streaming = fold([event("agent.thinking_delta", { attempt_id: "a1", block_id: "t1", text: "想" }, { after_seq: 1 })]);
    expect(markStreamGap(streaming).truncated).toEqual({ a1: true });
    const empty = { ...emptyLiveState, thinking: { a1: [{ id: "t1", text: "" }] } };
    expect(markStreamGap(empty)).toBe(empty);
  });

  it("marks attempts that were streaming when the stream dropped as truncated", () => {
    const streaming = fold([event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 })]);
    expect(markStreamGap(streaming).truncated).toEqual({ a1: true });
  });

  it("returns the same state when nothing is streaming", () => {
    expect(markStreamGap(emptyLiveState)).toBe(emptyLiveState);
    const empty = { ...emptyLiveState, live: { a1: [{ id: "", text: "" }] } };
    expect(markStreamGap(empty)).toBe(empty);
  });

  it("keeps earlier truncation marks and adds new ones", () => {
    const state = markStreamGap({ ...emptyLiveState, live: { a2: [{ id: "", text: "text" }] }, truncated: { a1: true } });
    expect(state.truncated).toEqual({ a1: true, a2: true });
  });

  it("clears the mark when the final message arrives", () => {
    const gapped = markStreamGap(
      fold([started("a1", 1), event("agent.token_delta", { attempt_id: "a1", text: "Hel" }, { after_seq: 1 })]),
    );
    const done = applyEvent(gapped, event("message.agent_final", { attempt_id: "a1", text: "Hello" }, { seq: 2, entity: ["attempt", "a1", 0] }));
    expect(done.truncated).toEqual({});
    // live 保留：更早的流式轮次要留给会话渲染，final 只代表最后一轮。
    expect(done.live["a1"]).toEqual([{ id: "", text: "Hel" }]);
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

describe("a node that fails and a task that waits for a person", () => {
  const nodeChange = (seq: number, node: string, from: string, to: string, reason = "") =>
    event("node.status_changed", { node_id: node, from_status: from, to_status: to, reason }, { seq, entity: ["node", node, seq] });
  const taskChange = (seq: number, to: string, reason = "", from = "RUNNING") =>
    event("task.status_changed", { from_status: from, to_status: to, reason }, { seq, entity: ["task", "task_1", seq] });

  it("keeps the latest status and reason per node: a retry, then blocked", () => {
    const retrying = fold([nodeChange(1, "n1", "RUNNING", "RETRY_PENDING", "model timed out")]);
    expect(retrying.nodes).toEqual({ n1: { status: "RETRY_PENDING", reason: "model timed out" } });
    const blocked = fold([nodeChange(2, "n1", "RETRY_PENDING", "BLOCKED", "gave up after 3 attempts")], retrying);
    expect(blocked.nodes.n1).toEqual({ status: "BLOCKED", reason: "gave up after 3 attempts" });
    const back = fold([nodeChange(3, "n1", "BLOCKED", "READY", "resumed by a person")], blocked);
    expect(back.nodes.n1?.status).toBe("READY");
  });

  it("ignores a node event with no node id", () => {
    expect(fold([event("node.status_changed", { to_status: "BLOCKED" }, { seq: 1 })]).nodes).toEqual({});
  });

  it("waits for a person with the reason, and stops waiting when the task leaves review", () => {
    const waiting = fold([taskChange(1, "PAUSED_NEEDS_REVIEW", "node n1 is blocked: gave up")]);
    expect(waiting.review).toEqual({ reason: "node n1 is blocked: gave up", rejection: null });
    expect(fold([taskChange(2, "RUNNING", "", "PAUSED_NEEDS_REVIEW")], waiting).review).toBeNull();
  });

  it("does not wait for a person on other pauses", () => {
    expect(fold([taskChange(1, "PAUSED")]).review).toBeNull();
  });

  it("carries the failure class of a failed attempt, and none for one that completed", () => {
    const failed = fold([
      started("a1", 1),
      event("attempt.finished", { attempt_id: "a1", outcome: "failed", failure: { failure_class: "model", retryable: true, message: "502 from the model" } }, { seq: 2, entity: ["attempt", "a1", 2] }),
    ]);
    expect(failed.attempts[0]).toMatchObject({ status: "failed", failure: { failureClass: "model", retryable: true, message: "502 from the model" } });
    const done = fold([started("a2", 3), event("attempt.finished", { attempt_id: "a2", outcome: "completed" }, { seq: 4, entity: ["attempt", "a2", 2] })]);
    expect(done.attempts[0]?.failure).toBeUndefined();
  });

  it("reads an old attempt.finished without a failure", () => {
    const state = fold([started("a1", 1), event("attempt.finished", { attempt_id: "a1", outcome: "failed" }, { seq: 2, entity: ["attempt", "a1", 2] })]);
    expect(state.attempts[0]).toMatchObject({ status: "failed" });
    expect(state.attempts[0]?.failure).toBeUndefined();
  });
});

describe("approvals that end without a decision from the person", () => {
  const decided = (seq: number, id: string, status: string) =>
    event("approval.decided", { approval_id: id, status }, { seq, entity: ["approval", id, 2] });

  it("records a cancelled approval, so the card leaves the pending state", () => {
    expect(fold([decided(1, "apr_1", "CANCELLED")]).approvals).toEqual({ apr_1: "CANCELLED" });
  });

  it("records the other outcomes too and keeps each approval apart", () => {
    const state = fold([decided(1, "apr_1", "APPROVED"), decided(2, "apr_2", "REJECTED"), decided(3, "apr_3", "CANCELLED")]);
    expect(state.approvals).toEqual({ apr_1: "APPROVED", apr_2: "REJECTED", apr_3: "CANCELLED" });
  });

  it("ignores a decision without an id or with a status it does not know", () => {
    expect(fold([decided(1, "", "CANCELLED"), decided(2, "apr_1", "EXPIRED")]).approvals).toEqual({});
  });
});

describe("a follow-up message that could not be added", () => {
  const rejected = (seq: number) => event("plan.change_rejected", { status: "rejected", code: "TOO_MANY_OPS", detail: "the plan is full" }, { seq });
  const review = (seq: number) =>
    event("task.status_changed", { from_status: "RUNNING", to_status: "PAUSED_NEEDS_REVIEW", reason: "message 2 could not be added to the plan: TOO_MANY_OPS: the plan is full" }, { seq, entity: ["task", "task_1", seq] });

  it("shows the person that the message was not taken up, and why", () => {
    const state = fold([rejected(1), review(2)]);
    expect(state.review).toEqual({
      reason: "message 2 could not be added to the plan: TOO_MANY_OPS: the plan is full",
      rejection: { code: "TOO_MANY_OPS", detail: "the plan is full" },
    });
    expect(state.rejection).toBeNull();
  });

  it("does not blame a later review on a rejection that other events came between", () => {
    const state = fold([rejected(1), started("a1", 2), event("task.status_changed", { from_status: "RUNNING", to_status: "PAUSED_NEEDS_REVIEW", reason: "unplannable" }, { seq: 3 })]);
    expect(state.review).toEqual({ reason: "unplannable", rejection: null });
  });

  it("lets ephemeral stream chunks sit between the rejection and the review", () => {
    const state = fold([rejected(1), event("agent.token_delta", { attempt_id: "a1", block_id: "b", text: "x" }, { after_seq: 1 }), review(2)]);
    expect(state.review?.rejection).toEqual({ code: "TOO_MANY_OPS", detail: "the plan is full" });
  });

  it("clears the notice when the task is resumed", () => {
    const state = fold([rejected(1), review(2), event("task.status_changed", { from_status: "PAUSED_NEEDS_REVIEW", to_status: "RUNNING", reason: "" }, { seq: 3, entity: ["task", "task_1", 3] })]);
    expect(state.review).toBeNull();
  });
});

describe("a plan with archived steps", () => {
  it("renders old events whose nodes the live plan no longer has: attempts and node events need no plan", () => {
    const state = fold([
      started("a1", 1),
      event("node.status_changed", { node_id: "n_archived", from_status: "RUNNING", to_status: "COMPLETED" }, { seq: 2, entity: ["node", "n_archived", 2] }),
      event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 3, entity: ["attempt", "a1", 2] }),
    ]);
    expect(state.attempts[0]).toMatchObject({ nodeId: "n1", status: "completed" });
    expect(state.nodes.n_archived).toEqual({ status: "COMPLETED", reason: "" });
  });
});

describe("a task that runs out of budget", () => {
  const nodeChange = (seq: number, node: string, from: string, to: string, reason = "") =>
    event("node.status_changed", { node_id: node, from_status: from, to_status: to, reason }, { seq, entity: ["node", node, seq] });
  const taskChange = (seq: number, to: string, reason = "", from = "RUNNING") =>
    event("task.status_changed", { from_status: from, to_status: to, reason }, { seq, entity: ["task", "task_1", seq] });
  const exhausted = (seq: number, detail = "tokens: the node needs 800 and 400 is left") =>
    event("budget.exhausted", { scope: "task", node_id: "n1", detail }, { seq });

  it("takes the detail of budget.exhausted into the review notice", () => {
    const state = fold([exhausted(1), taskChange(2, "PAUSED_NEEDS_REVIEW", "budget exhausted: node n1 cannot start")]);
    expect(state.review?.budget).toEqual({ scope: "task", nodeId: "n1", detail: "tokens: the node needs 800 and 400 is left" });
  });

  it("keeps a budget.exhausted without a detail (the exploration ran out) as a budget wait", () => {
    const state = fold([event("budget.exhausted", { scope: "exploration", node_id: "n1" }, { seq: 1 }), taskChange(2, "PAUSED_NEEDS_REVIEW", "exploration budget spent without a plan")]);
    expect(state.review?.budget).toEqual({ scope: "exploration", nodeId: "n1", detail: "" });
  });

  it("knows an attempt that spent its budget from its failure class, with the node blocked", () => {
    const state = fold([
      started("a1", 1),
      event("attempt.finished", { attempt_id: "a1", outcome: "failed", failure: { failure_class: "budget", retryable: false, message: "the attempt's token budget is spent" } }, { seq: 2, entity: ["attempt", "a1", 2] }),
      nodeChange(3, "n1", "RUNNING", "BLOCKED", "a budget failure that cannot be retried"),
      taskChange(4, "PAUSED_NEEDS_REVIEW", "node n1 is blocked"),
    ]);
    expect(state.attempts[0]?.failure?.failureClass).toBe("budget");
    expect(state.review?.budget).toEqual({ scope: "node", nodeId: "n1", detail: "the attempt's token budget is spent" });
  });

  it("is not a budget wait when the node is blocked for another reason, or its latest attempt failed otherwise", () => {
    const state = fold([
      started("a1", 1),
      event("attempt.finished", { attempt_id: "a1", outcome: "failed", failure: { failure_class: "budget", retryable: false, message: "spent" } }, { seq: 2, entity: ["attempt", "a1", 2] }),
      started("a2", 3, 3),
      event("attempt.finished", { attempt_id: "a2", outcome: "failed", failure: { failure_class: "model", retryable: true, message: "502" } }, { seq: 4, entity: ["attempt", "a2", 4] }),
      nodeChange(5, "n1", "RUNNING", "BLOCKED", "retries are used up"),
      taskChange(6, "PAUSED_NEEDS_REVIEW", "node n1 is blocked"),
    ]);
    expect(state.review?.budget).toBeUndefined();
  });

  it("does not blame a later review on an old budget.exhausted that a grant or another status change followed", () => {
    const granted = fold([exhausted(1), event("budget.granted", { command_id: "c1", delta: { tokens: 1000 } }, { seq: 2 }), taskChange(3, "PAUSED_NEEDS_REVIEW", "something else")]);
    expect(granted.review?.budget).toBeUndefined();
    const held = fold([exhausted(1), taskChange(2, "PAUSED"), taskChange(3, "PAUSED_NEEDS_REVIEW", "something else", "PAUSED")]);
    expect(held.review?.budget).toBeUndefined();
  });

  it("clears the wait when the grant resumes the task", () => {
    const waiting = fold([exhausted(1), taskChange(2, "PAUSED_NEEDS_REVIEW", "budget exhausted")]);
    const resumed = fold([event("budget.granted", { command_id: "c1", delta: { tokens: 1000 } }, { seq: 3 }), taskChange(4, "RUNNING", "budget_granted", "PAUSED_NEEDS_REVIEW")], waiting);
    expect(resumed.review).toBeNull();
    expect(resumed.exhausted).toBeNull();
  });

  it("tracks what running attempts hold back, and gives it back when they end; an unknown cost stays absent", () => {
    const state = fold([
      event("attempt.started", { attempt_id: "a1", node_id: "n1", attempt_no: 1, budget_reserved: { tokens: 600, tool_calls: null, cost_usd_micros: null } }, { seq: 1, entity: ["attempt", "a1", 1] }),
      event("attempt.started", { attempt_id: "a2", node_id: "n2", attempt_no: 1, budget_reserved: { tokens: 300, wall_s: 60 } }, { seq: 2, entity: ["attempt", "a2", 1] }),
    ]);
    expect(state.reserved).toEqual({ a1: { tokens: 600 }, a2: { tokens: 300, wall_s: 60 } });
    expect(totalReserved(state)).toEqual({ tokens: 900, wall_s: 60 });
    const after = fold([event("attempt.finished", { attempt_id: "a1", outcome: "completed" }, { seq: 3, entity: ["attempt", "a1", 2] })], state);
    expect(totalReserved(after)).toEqual({ tokens: 300, wall_s: 60 });
    // An attempt without a reservation (older events) holds nothing.
    expect(fold([started("a3", 4)]).reserved).toEqual({});
  });

  it("reads budget amounts leniently", () => {
    expect(budgetAmounts({ tokens: 5, wall_s: -1, cost_usd_micros: null, tool_calls: "x" })).toEqual({ tokens: 5 });
    expect(budgetAmounts(null)).toEqual({});
  });
});

describe("a task a person takes over", () => {
  it("keeps the reason a person gave when completing a node by hand", () => {
    const state = fold([
      event("task.status_changed", { from_status: "RUNNING", to_status: "TAKEN_OVER", reason: "" }, { seq: 1, entity: ["task", "task_1", 1] }),
      event("node.status_changed", { node_id: "n1", from_status: "READY", to_status: "COMPLETED", reason: "I wrote the file myself", frozen: true }, { seq: 2, entity: ["node", "n1", 1] }),
    ]);
    expect(state.nodes.n1).toEqual({ status: "COMPLETED", reason: "I wrote the file myself" });
  });
});

describe("a node whose profile is switched", () => {
  it("records the switch and says on the next attempt which profile it came from", () => {
    const state = fold([
      event("profile.switched", { node_id: "n1", from_profile: "default@1", to_profile: "coder@2", reason: "needs a coder", approval_id: "apr_1" }, { seq: 1 }),
      event("attempt.started", { attempt_id: "a2", node_id: "n1", attempt_no: 2, profile: "coder@2", switched_from: "default@1" }, { seq: 2, entity: ["attempt", "a2", 1] }),
    ]);
    expect(state.switches).toEqual([{ nodeId: "n1", from: "default@1", to: "coder@2", reason: "needs a coder", approvalId: "apr_1" }]);
    expect(state.attempts[0]).toMatchObject({ profile: "coder@2", switchedFrom: "default@1" });
  });

  it("is pending until an attempt of the node runs as the new profile", () => {
    const switched = fold([event("profile.switched", { node_id: "n1", from_profile: "default@1", to_profile: "coder@2", reason: "r" }, { seq: 1 })]);
    expect(pendingSwitch(switched, "n1")?.to).toBe("coder@2");
    expect(pendingSwitch(switched, "n2")).toBeNull();
    const running = fold([event("attempt.started", { attempt_id: "a1", node_id: "n1", attempt_no: 1, profile: "default@1" }, { seq: 2, entity: ["attempt", "a1", 1] })], switched);
    expect(pendingSwitch(running, "n1")?.to).toBe("coder@2");
    const applied = fold([event("attempt.started", { attempt_id: "a2", node_id: "n1", attempt_no: 2, profile: "coder@2", switched_from: "default@1" }, { seq: 3, entity: ["attempt", "a2", 1] })], running);
    expect(pendingSwitch(applied, "n1")).toBeNull();
  });

  it("leaves switchedFrom off an attempt that was not switched, and ignores a switch with no node", () => {
    const state = fold([event("profile.switched", { from_profile: "a@1", to_profile: "b@1", reason: "x" }, { seq: 1 }), started("a1", 2)]);
    expect(state.switches).toEqual([]);
    expect(state.attempts[0]?.switchedFrom).toBeUndefined();
  });
});

describe("a node's status events keyed by node or by task", () => {
  const nodeEvent = (seq: number, to: string, entity: [string, string, number]) =>
    event("node.status_changed", { node_id: "n1", from_status: "READY", to_status: to }, { seq, entity });

  it("applies per-node versions: two nodes counting from 1 do not hide each other", () => {
    const state = fold([
      event("node.status_changed", { node_id: "n1", to_status: "RUNNING" }, { seq: 1, entity: ["node", "n1", 3] }),
      event("node.status_changed", { node_id: "n2", to_status: "RUNNING" }, { seq: 2, entity: ["node", "n2", 1] }),
    ]);
    expect(state.nodes).toMatchObject({ n1: { status: "RUNNING" }, n2: { status: "RUNNING" } });
    expect(state.versions).toMatchObject({ "node:n1": 3, "node:n2": 1 });
  });

  it("ignores a late older event of the same node", () => {
    const state = fold([nodeEvent(2, "COMPLETED", ["node", "n1", 4]), nodeEvent(1, "RUNNING", ["node", "n1", 3])]);
    expect(state.nodes.n1?.status).toBe("COMPLETED");
  });

  it("still orders events of the older shape, where the node's change carries the task's version", () => {
    const state = fold([nodeEvent(2, "COMPLETED", ["task", "task_1", 7]), nodeEvent(1, "RUNNING", ["task", "task_1", 6])]);
    expect(state.nodes.n1?.status).toBe("COMPLETED");
    expect(state.versions).toEqual({ "task:task_1": 7 });
  });

  it("mixes both shapes in one log", () => {
    const state = fold([nodeEvent(1, "RUNNING", ["task", "task_1", 5]), nodeEvent(2, "COMPLETED", ["node", "n1", 1])]);
    expect(state.nodes.n1?.status).toBe("COMPLETED");
  });
});
