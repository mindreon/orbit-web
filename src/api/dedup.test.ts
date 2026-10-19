import { describe, expect, it } from "vitest";
import { emptyRunStream, reduceRunEvent, type RunEventLike } from "./timeline";

const event = (n: number): RunEventLike => ({ id: `run:leader:1:0:${n}`, member: "leader", segment: 1, attempt: 0, type: "message.delta", data: { message_id: "m", delta: "x" } });
describe("exact tuple deduplication", () => {
  it("does not reapply a duplicate after more than 2048 events", () => {
    let state = emptyRunStream;
    for (let n = 1; n <= 3000; n++) state = reduceRunEvent(state, event(n));
    expect(reduceRunEvent(state, event(1)).messages[0].text).toHaveLength(3000);
  });
  it("accepts gaps and huge jumps once, and compacts the contiguous prefix", () => {
    let state = emptyRunStream;
    for (const n of [3, 1, 3, 1000000000, 2, 1000000000]) state = reduceRunEvent(state, event(n));
    expect(state.messages[0].text).toBe("xxxx");
    expect(Object.values(state.dedup)).toEqual([{ highWater: 3, sparse: [1000000000] }]);
  });
  it("stores constant memory for a contiguous long run", () => {
    let state = emptyRunStream;
    for (let n = 1; n <= 10000; n++) state = reduceRunEvent(state, event(n));
    expect(Object.values(state.dedup)).toEqual([{ highWater: 10000, sparse: [] }]);
  });
});
