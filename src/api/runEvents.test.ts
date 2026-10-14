import { describe, expect, it } from "vitest";
import { emptyRunStream, reduceRunEvent, type RunEventLike, type RunStreamState } from "./runEvents";

/**
 * Ways the retry-overwrite rule (design §8.3) can fail, each asserted below:
 *   R1 half a message written by a dead attempt stays on screen next to the retry's message
 *   R2 a retry throws away a message that was already final (and persisted)
 *   R3 a late delta of the dead attempt is appended to the retry's text
 *   R4 a retry of one segment (or one member's segment) disturbs another
 *   R5 replaying events (same attempt announced twice, final twice) duplicates or rewrites content
 *   R6 the reducer mutates the state it was given
 */

let eventSequence = 0;
// Envelope/payload fields follow contract/v2/schema/run_event.json; reasoning.delta assumes the agreed message_id revision.
const ev = (type: string, segment: number, attempt: number, data: Record<string, unknown> = {}, member = "leader"): RunEventLike => ({ id: `evt-${++eventSequence}`, type, segment, attempt, member, data: type === "segment.started" ? { expected_checkpoint_version: 0 } : data });
const delta = (segment: number, attempt: number, messageId: string, text: string, member?: string) => ev("message.delta", segment, attempt, { message_id: messageId, delta: text }, member);
const fold = (events: RunEventLike[], from: RunStreamState = emptyRunStream) => events.reduce(reduceRunEvent, from);
const texts = (state: RunStreamState) => state.messages.map((message) => `${message.messageId}:${message.text}${message.final ? "!" : ""}`);

describe("reduceRunEvent", () => {
  it("builds a message from its deltas", () => {
    const state = fold([ev("segment.started", 1, 0), delta(1, 0, "m1", "根据"), delta(1, 0, "m1", "第 4.2 条")]);
    expect(texts(state)).toEqual(["m1:根据第 4.2 条"]);
  });

  it("keeps reasoning apart from the answer", () => {
    const state = fold([delta(1, 0, "m1", "答"), ev("reasoning.delta", 1, 0, { message_id: "m1", delta: "想" })]);
    expect(state.messages[0]).toMatchObject({ text: "答", reasoning: "想" });
  });

  it("completes a message with message.final and takes its full content", () => {
    const state = fold([delta(1, 0, "m1", "半截"), ev("message.final", 1, 0, { message_id: "m1", text: "完整的回答" })]);
    expect(texts(state)).toEqual(["m1:完整的回答!"]);
  });

  it("retains content_ref for a final received without deltas", () => {
    const state = fold([ev("message.final", 1, 0, { message_id: "m1", content_ref: "t/tenant/blobs/answer" })]);
    expect(state.messages[0]).toMatchObject({ text: "", contentRef: "t/tenant/blobs/answer", final: true });
  });

  it("merges reasoning before text into the same message, keeping model calls separate", () => {
    const state = fold([
      ev("reasoning.delta", 1, 0, { message_id: "m1", delta: "think" }),
      ev("reasoning.delta", 1, 0, { message_id: "m2", delta: "other" }),
      delta(1, 0, "m1", "answer"),
    ]);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({ messageId: "m1", reasoning: "think", text: "answer" });
  });

  it("ignores replayed answer and reasoning deltas by envelope id", () => {
    const answer = delta(1, 0, "m1", "answer");
    const reasoning = ev("reasoning.delta", 1, 0, { message_id: "m1", delta: "think" });
    const state = fold([answer, reasoning, answer, reasoning]);
    expect(state.messages[0]).toMatchObject({ text: "answer", reasoning: "think" });
  });

  it("bounds remembered event ids", () => {
    const state = fold(Array.from({ length: 2100 }, () => delta(1, 0, "m1", "x")));
    expect(state.processedIds).toHaveLength(2048);
    expect(new Set(state.processedIds).size).toBe(2048);
  });

  it("drops the unfinished text of a lower attempt when a higher one starts (R1)", () => {
    const state = fold([delta(1, 0, "m1", "半截"), ev("segment.started", 1, 1), delta(1, 1, "m1", "重来")]);
    expect(texts(state)).toEqual(["m1:重来"]);
  });

  it("drops it even when the retry used another message id", () => {
    const state = fold([delta(1, 0, "m1", "半截"), ev("segment.started", 1, 1), delta(1, 1, "m2", "重来")]);
    expect(texts(state)).toEqual(["m2:重来"]);
  });

  it("keeps messages that were already final (R2)", () => {
    const state = fold([ev("message.final", 1, 0, { message_id: "m1", text: "已落库" }), delta(1, 0, "m2", "半截"), ev("segment.started", 1, 1)]);
    expect(texts(state)).toEqual(["m1:已落库!"]);
  });

  it("ignores a late delta from the attempt that was replaced (R3)", () => {
    const state = fold([ev("segment.started", 1, 1), delta(1, 1, "m1", "新"), delta(1, 0, "m1", "旧的尾巴")]);
    expect(texts(state)).toEqual(["m1:新"]);
  });

  it("notices a retry from its deltas when segment.started was missed", () => {
    const state = fold([delta(1, 0, "m1", "半截"), delta(1, 1, "m1", "重来")]);
    expect(texts(state)).toEqual(["m1:重来"]);
  });

  it("does not let a retry touch other segments or other members (R4)", () => {
    const state = fold([
      delta(1, 0, "m1", "第一段", "leader"),
      delta(2, 0, "m2", "第二段半截", "leader"),
      delta(2, 0, "m3", "别的成员", "writer"),
      ev("segment.started", 2, 1, {}, "leader"),
    ]);
    expect(texts(state)).toEqual(["m1:第一段", "m3:别的成员"]);
  });

  it("treats a repeated segment.started as a no-op (R5)", () => {
    const state = fold([ev("segment.started", 1, 1), delta(1, 1, "m1", "内容"), ev("segment.started", 1, 1), ev("segment.started", 1, 0)]);
    expect(texts(state)).toEqual(["m1:内容"]);
  });

  it("ignores deltas after the final, and a replayed final (R5)", () => {
    const final = ev("message.final", 1, 0, { message_id: "m1", text: "定稿" });
    const state = fold([delta(1, 0, "m1", "半"), final, delta(1, 0, "m1", "重放的 delta"), final]);
    expect(texts(state)).toEqual(["m1:定稿!"]);
  });

  it("passes other event types through untouched", () => {
    const before = fold([delta(1, 0, "m1", "a")]);
    expect(reduceRunEvent(before, ev("tool.call", 1, 0))).toBe(before);
  });

  it("does not mutate its input (R6)", () => {
    const before = fold([delta(1, 0, "m1", "a")]);
    const snapshot = JSON.stringify(before);
    reduceRunEvent(before, delta(1, 0, "m1", "b"));
    reduceRunEvent(before, ev("segment.started", 1, 1));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
