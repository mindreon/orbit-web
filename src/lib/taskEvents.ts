import type { TaskEvent } from "./tasks";

export type AttemptStatus = "running" | "parked_approval" | "parked_input" | "completed" | "failed" | "cancelled";

export interface AttemptView {
  readonly attemptId: string;
  readonly nodeId: string;
  readonly attemptNo: number;
  readonly status: AttemptStatus;
  /** How many times the same attempt was picked up again (a worker crash, an approval, a user reply). */
  readonly resumed: number;
  readonly finalText?: string;
}

export interface AgentQuestion {
  readonly attemptId: string;
  readonly text: string;
}

/** The text one model round has streamed so far. */
export interface LiveBlock {
  readonly id: string;
  readonly text: string;
}

export interface TaskLiveState {
  readonly attempts: readonly AttemptView[];
  readonly question: AgentQuestion | null;
  /** Streamed text per attempt that has not produced its final message yet, one block per model round. */
  readonly live: Readonly<Record<string, readonly LiveBlock[]>>;
  /** Attempts whose live text may miss chunks because the stream dropped while they were writing. */
  readonly truncated: Readonly<Record<string, true>>;
  /** The highest `entity.version` applied per `kind:id`. Only events with a version above it are applied (09 §1). */
  readonly versions: Readonly<Record<string, number>>;
}

export const emptyLiveState: TaskLiveState = { attempts: [], question: null, live: {}, truncated: {}, versions: {} };

const field = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  return typeof value === "string" ? value : "";
};

const withAttempt = (
  attempts: readonly AttemptView[],
  attemptId: string,
  change: (attempt: AttemptView) => AttemptView,
): readonly AttemptView[] => attempts.map((attempt) => (attempt.attemptId === attemptId ? change(attempt) : attempt));

const without = <T extends Record<string, unknown>>(record: T, key: string): T => {
  const { [key]: _removed, ...rest } = record;
  return rest as T;
};

/** A delta continues the block it belongs to; the first delta of another block starts a new one. */
function appendDelta(blocks: readonly LiveBlock[], id: string, text: string): readonly LiveBlock[] {
  const last = blocks[blocks.length - 1];
  return last !== undefined && last.id === id ? [...blocks.slice(0, -1), { id, text: last.text + text }] : [...blocks, { id, text }];
}

const finishedStatus = (outcome: string): AttemptStatus =>
  outcome === "completed" ? "completed" : outcome === "cancelled" ? "cancelled" : "failed";

function applyChange(state: TaskLiveState, event: TaskEvent): TaskLiveState {
  const payload = event.payload;
  const attemptId = field(payload, "attempt_id");
  switch (event.type) {
    case "attempt.started":
      return {
        ...state,
        attempts: [
          ...state.attempts,
          { attemptId, nodeId: field(payload, "node_id"), attemptNo: Number(payload.attempt_no ?? 1), status: "running", resumed: 0 },
        ],
      };
    case "attempt.parked": {
      const isInput = payload.reason === "input";
      return {
        ...state,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: isInput ? "parked_input" : "parked_approval" })),
        question: isInput ? { attemptId, text: field(payload, "question") } : state.question,
      };
    }
    case "attempt.resumed":
      return {
        ...state,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: "running", resumed: a.resumed + 1 })),
        question: state.question?.attemptId === attemptId ? null : state.question,
      };
    case "attempt.finished":
      return {
        ...state,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: finishedStatus(field(payload, "outcome")) })),
        question: state.question?.attemptId === attemptId ? null : state.question,
        live: without(state.live, attemptId),
        truncated: without(state.truncated, attemptId),
      };
    case "agent.token_delta":
      return { ...state, live: { ...state.live, [attemptId]: appendDelta(state.live[attemptId] ?? [], field(payload, "block_id"), field(payload, "text")) } };
    case "message.agent_final":
      return {
        ...state,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, finalText: field(payload, "text") })),
        live: without(state.live, attemptId),
        truncated: without(state.truncated, attemptId),
      };
    default:
      return state;
  }
}

/**
 * Folds one event into the state. Per entity an event with an older `entity.version` than the one already applied is
 * ignored, so a late older event cannot turn the state back (09 §1). An equal version is applied: control stamps an
 * unversioned worker event (a worker's `attempt.resumed`, version 0) with the entity's current version, and a
 * duplicate delivery is removed by `mergeEvent` (same event_id or seq), not here. Version 0, and an event with no
 * entity, are always applied and do not move the mark.
 */
export function applyEvent(state: TaskLiveState, event: TaskEvent): TaskLiveState {
  const version = event.entity?.version ?? 0;
  if (!event.entity || version <= 0) return applyChange(state, event);
  const key = `${event.entity.kind}:${event.entity.id}`;
  if (version < (state.versions[key] ?? 0)) return state;
  const next = applyChange(state, event);
  return { ...next, versions: { ...next.versions, [key]: version } };
}

/** The stream dropped: text streamed so far may be missing chunks until the attempt's final message arrives. */
export function markStreamGap(state: TaskLiveState): TaskLiveState {
  const streaming = Object.keys(state.live).filter((id) => state.live[id].some((block) => block.text !== ""));
  if (streaming.length === 0) return state;
  return { ...state, truncated: { ...state.truncated, ...Object.fromEntries(streaming.map((id) => [id, true as const])) } };
}

/** Where an event sits in the stream: a durable event at its seq, an ephemeral one right after the durable event it follows. */
const position = (event: TaskEvent): number => (event.seq > 0 ? event.seq * 2 : (event.after_seq ?? 0) * 2 + 1);

/**
 * Adds an event to the log once, in stream order. Replays after a reconnect are therefore harmless, and state built
 * by folding the log is the same whichever order the frames arrived in (09 §1).
 */
export function mergeEvent(events: readonly TaskEvent[], event: TaskEvent): readonly TaskEvent[] {
  if (events.some((item) => item.event_id === event.event_id || (event.seq > 0 && item.seq === event.seq))) return events;
  return [...events, event].sort((a, b) => position(a) - position(b));
}
