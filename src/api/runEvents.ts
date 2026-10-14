/**
 * The part of a run event (`orbit.event/v1`, design §8.3) the stream reducer reads. Every event carries `(segment, attempt)`:
 * when Temporal retries a segment, the new attempt announces itself with `segment.started{attempt}`, and whatever the older
 * attempts had not finished is discarded. WP9 types the full envelope from the generated schema.
 */
export interface RunEventLike {
  readonly id: string;
  readonly type: string;
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
  /** The highest attempt seen per segment (`member#segment`). */
  /** Recent envelope ids, in arrival order. Replays within this bounded window are ignored. */
  readonly processedIds: readonly string[];
  readonly attempts: Readonly<Record<string, number>>;
  readonly messages: readonly StreamedMessage[];
}

export const emptyRunStream: RunStreamState = { processedIds: [], attempts: {}, messages: [] };

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
  return { ...state, messages: [...state.messages, update(created)] };
}

/** Folds one event into the stream state. Pure: the same events in the same order always give the same state. */
export function reduceRunEvent(state: RunStreamState, event: RunEventLike): RunStreamState {
  if (!["segment.started", "message.delta", "reasoning.delta", "message.final"].includes(event.type)) return state;
  if (state.processedIds.includes(event.id)) return state;
  state = { ...state, processedIds: [...state.processedIds.slice(-2047), event.id] };
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
      return state;
  }
}
