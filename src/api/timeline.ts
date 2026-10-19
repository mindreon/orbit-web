import type { TypedRunEvent } from "./events";
import type { S } from "./types";

/**
 * The part of a run event (`orbit.event/v1`, design §8.3) the stream reducer reads. Every event carries `(segment, attempt)`:
 * when Temporal retries a segment, the new attempt announces itself with `segment.started{attempt}`, and whatever the older
 * attempts had not finished is discarded.
 */
export interface RunEventLike {
  readonly id: string;
  readonly type: string;
  readonly ts?: string;
  /** The team member the event belongs to; segments are numbered per member. */
  readonly member: string;
  readonly segment: number;
  readonly attempt: number;
  readonly data: Readonly<Record<string, unknown>>;
}

/** An assistant message as it builds up on screen. */
export interface StreamedMessage {
  readonly member: string;
  readonly segment: number;
  readonly attempt: number;
  readonly messageId: string;
  readonly text: string;
  readonly reasoning: string;
  /** Full content to fetch when the final payload is too large for an event. */
  readonly contentRef?: string;
  /** `message.final` arrived: the text is complete and persisted, so a retry of the segment never takes it back. */
  readonly final: boolean;
}

export interface RunStreamState {
  readonly status: S["RunState"] | null;
  readonly error: { code: string; message: string } | null;
  readonly tools: ReadonlyMap<string, TimelineTool>;
  readonly interactions: ReadonlyMap<string, { request?: S["InteractionRequested"]; resolution?: S["InteractionResolved"] }>;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly teamSignal: number;
  readonly teamMessages: readonly S["TeamMessage"][];
  readonly usage: S["UsageUpdate"] | null;
  readonly order: readonly TimelineOrder[];
  readonly dedup: Readonly<Record<string, { readonly highWater: number; readonly sparse: readonly number[] }>>;
  /** The highest attempt seen per segment (`member#segment`). */
  readonly attempts: Readonly<Record<string, number>>;
  readonly messages: readonly StreamedMessage[];
}

export interface TimelineTool {
  readonly member: string; readonly segment: number; readonly attempt: number;
  readonly call?: S["ToolCall"]; readonly result?: S["ToolResult"];
  readonly output: string;
}
export interface TimelineOrder { readonly kind: "message" | "tool" | "interaction" | "team"; readonly key: string; readonly ts?: string; }
export const emptyRunStream: RunStreamState = { dedup: {}, attempts: {}, messages: [], status: null, error: null, tools: new Map(), interactions: new Map(), artifacts: {}, teamSignal: 0, teamMessages: [], usage: null, order: [] };
const terminal = new Set(["succeeded", "cancelled", "budget_exhausted", "timed_out", "failed"]);

const segmentKey = (event: RunEventLike) => `${event.member}#${event.segment}`;
const messageIdOf = (event: RunEventLike) => event.data.message_id as string;
const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** A new attempt of a segment replaces the unfinished messages of its older attempts. */
function enterAttempt(state: RunStreamState, event: RunEventLike): RunStreamState {
  const key = segmentKey(event);
  const known = state.attempts[key] ?? -1;
  if (event.attempt <= known) return state;
  return {
    ...state,
    attempts: { ...state.attempts, [key]: event.attempt },
    messages: state.messages.filter((message) => message.final || `${message.member}#${message.segment}` !== key),
    tools: new Map([...state.tools].filter(([, tool]) => tool.result || `${tool.member}#${tool.segment}` !== key)),
    order: state.order.filter((item) => {
      if (item.kind === "message") return !state.messages.some((message) => !message.final && `${message.member}#${message.segment}` === key && item.key === `${message.member}#${message.segment}#${message.messageId}`);
      if (item.kind === "tool") { const tool = state.tools.get(item.key); return !tool || Boolean(tool.result) || `${tool.member}#${tool.segment}` !== key; }
      return true;
    }),
  };
}

function upsert(state: RunStreamState, event: RunEventLike, update: (message: StreamedMessage) => StreamedMessage): RunStreamState {
  const messageId = messageIdOf(event);
  const member = event.member;
  const index = state.messages.findIndex((message) => message.member === member && message.segment === event.segment && message.messageId === messageId);
  if (index >= 0) {
    const current = state.messages[index];
    if (current.final) return state;
    return { ...state, messages: state.messages.map((message, i) => (i === index ? update(current) : message)) };
  }
  const created: StreamedMessage = { member, segment: event.segment, attempt: event.attempt, messageId, text: "", reasoning: "", final: false };
  return { ...addOrder(state, "message", `${member}#${event.segment}#${messageId}`, event.ts), messages: [...state.messages, update(created)] };
}

/** Folds one event into the stream state. Pure: the same events in the same order always give the same state. */
export function reduceRunEvent(state: RunStreamState, event: RunEventLike): RunStreamState {
  if (event.type === "unknown") return state;
  const next = remember(state, event);
  if (!next) return state;
  state = next;
  switch (event.type) {
    case "segment.started":
      return enterAttempt(state, event);
    case "message.delta":
    case "reasoning.delta": {
      // A delta of an attempt the segment has already moved past is a late arrival from the dead one.
      if (event.attempt < (state.attempts[segmentKey(event)] ?? -1)) return state;
      const next = enterAttempt(state, event);
      const delta = textOf(event.data.delta);
      return upsert(next, event, (message) => (event.type === "message.delta" ? { ...message, text: message.text + delta } : { ...message, reasoning: message.reasoning + delta }));
    }
    case "message.final": {
      // Final text is persisted under (run, segment, message_id) whatever the attempt, so it is accepted even from an older attempt.
      const text = event.data.text;
      const contentRef = typeof text !== "string" && typeof event.data.content_ref === "string" ? event.data.content_ref : undefined;
      return upsert(state, event, (message) => ({ ...message, text: typeof text === "string" ? text : message.text, contentRef, final: true }));
    }
    default:
      return reduceOther(state, event as TypedRunEvent);
  }
}

/** Exact prefix + sparse-set deduplication, independent of arrival order and total contiguous history size. */
function remember(state: RunStreamState, event: RunEventLike): RunStreamState | null {
  const parts = event.id.split(":");
  const n = Number(parts.pop());
  const tuple = parts.join(":");
  if (!Number.isSafeInteger(n) || n < 1 || parts.length !== 4) throw new Error("Invalid event envelope id");
  const previous = state.dedup[tuple] ?? { highWater: 0, sparse: [] };
  if (n <= previous.highWater || previous.sparse.includes(n)) return null;
  const sparse = new Set(previous.sparse);
  sparse.add(n);
  let highWater = previous.highWater;
  while (sparse.delete(highWater + 1)) highWater++;
  return { ...state, dedup: { ...state.dedup, [tuple]: { highWater, sparse: [...sparse].sort((a, b) => a - b) } } };
}

function addOrder(state: RunStreamState, kind: TimelineOrder["kind"], key: string, ts?: string): RunStreamState {
  if (state.order.some((item) => item.kind === kind && item.key === key)) return state;
  return { ...state, order: [...state.order, { kind, key, ...(ts ? { ts } : {}) }] };
}
function reduceOther(state: RunStreamState, event: TypedRunEvent): RunStreamState {
  switch (event.type) {
    case "run.started": return terminal.has(state.status ?? "") ? state : { ...state, status: "running" };
    case "run.status": return terminal.has(state.status ?? "") && !terminal.has(event.data.status) ? state : { ...state, status: event.data.status };
    case "run.completed": return { ...state, status: event.data.status };
    case "run.failed": return { ...state, status: "failed", error: event.data };
    case "error": return { ...state, error: event.data, status: event.data.terminal ? "failed" : state.status };
    case "tool.call": case "tool.result": case "sandbox.output": {
      if (event.attempt < (state.attempts[segmentKey(event)] ?? -1)) return state;
      state = enterAttempt(state, event);
      const key = event.data.call_id;
      const current = state.tools.get(key);
      if (event.type === "tool.call") {
        const tool = current ? { ...current, call: event.data } : { member: event.member, segment: event.segment, attempt: event.attempt, call: event.data, output: "" };
        return { ...addOrder(state, "tool", key, event.ts), tools: new Map(state.tools).set(key, tool) };
      }
      // Tool results and sandbox output only decorate calls already present in the timeline.
      if (!current || current.member !== event.member || current.segment !== event.segment || current.attempt !== event.attempt) return state;
      const tool: TimelineTool = event.type === "tool.result"
        ? { ...current, result: event.data }
        : { ...current, output: tailUtf8(current.output + event.data.text, 64 * 1024) };
      return { ...state, tools: new Map(state.tools).set(key, tool) };
    }
    case "interaction.requested": {
      const key = event.data.interaction.interaction_id;
      return { ...addOrder(state, "interaction", key, event.ts), interactions: new Map(state.interactions).set(key, { ...state.interactions.get(key), request: event.data }) };
    }
    case "interaction.resolved": {
      const key = event.data.interaction_id;
      return { ...addOrder(state, "interaction", key, event.ts), interactions: new Map(state.interactions).set(key, { ...state.interactions.get(key), resolution: event.data }) };
    }
    case "artifact.created": case "artifact.updated": return { ...state, artifacts: { ...state.artifacts, [event.data.artifact.path]: event.data.artifact.digest } };
    case "team.message": return { ...addOrder(state, "team", event.data.message_id, event.ts), teamSignal: state.teamSignal + 1, teamMessages: [...state.teamMessages, event.data] };
    case "team.task.created": case "team.task.updated": case "team.member.status": return { ...state, teamSignal: state.teamSignal + 1 };
    case "usage.update": return { ...state, usage: event.data };
    default: return state;
  }
}
function tailUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  let start = bytes.length - maxBytes;
  while ((bytes[start] & 0xc0) === 0x80) start++;
  return new TextDecoder().decode(bytes.subarray(start));
}
