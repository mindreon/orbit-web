import { ORBIT_EVENT_TYPES, TOOL_STATES, TURN_ERROR_CODES, type OrbitEvent, type TurnFailure } from "./orbit-event.gen";

export type { OrbitEvent, TurnFailure } from "./orbit-event.gen";
export type OrbitEventType = OrbitEvent["type"];
export type ToolState = (typeof TOOL_STATES)[number];
export type TurnErrorCode = (typeof TURN_ERROR_CODES)[number];

/** Event types orbit-control publishes itself, next to the runtime's OrbitEvent types. */
const CONTROL_EVENT_TYPES = ["room.steered"] as const;
type ControlEventType = (typeof CONTROL_EVENT_TYPES)[number];

const KNOWN_TYPES: ReadonlySet<string> = new Set<string>([...ORBIT_EVENT_TYPES, ...CONTROL_EVENT_TYPES]);

/**
 * One item of GET /v1/rooms/{id}/activity, or one SSE frame of /events.
 * orbit-control wraps the runtime OrbitEvent with its own envelope (id, sequence, source, role, approvalId, reason).
 *
 * Two numbering schemes, never mixed (contract C33):
 * - `sequence` is the per-task event sequence. The same number is the SSE `id:` of the frame, and the stream is
 *   resumed (Last-Event-ID) and deduped by it.
 * - `seq` on assistant.delta is the chunk index within one block; drafts are assembled by
 *   (turnId, blockId, seq, activityAttempt).
 * `id` is the event's own id (JSON body); it only keys UI rows.
 */
export type ActivityEvent = Omit<Partial<OrbitEvent>, "type" | "roomId" | "modelMode"> & {
  type: OrbitEventType | ControlEventType;
  roomId: string;
  id: string;
  sequence: number;
  source?: string;
  role?: string;
  approvalId?: string;
  reason?: string;
  protocol?: string;
  /** C33: `Literal["mock", "real"]`. */
  modelMode?: "mock" | "real" | "";
  /** C33: tool.result text was capped at 4KB. */
  truncated?: boolean;
};

const NUMERIC = /^\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * orbit-control wraps events as `{id, type, taskId, ts, source, payload}` (docs/contract-notes/sse-resume.md): `id` is
 * the event id and the SSE `id:` (absent on assistant.delta and reset), `payload` is the runtime event unchanged.
 * Flattens that to one object; an already-flat item (older control) passes through.
 */
function unwrapEnvelope(input: unknown): unknown {
  if (!isRecord(input) || !isRecord(input.payload)) return input;
  const payload = input.payload;
  return {
    ...payload,
    type: typeof input.type === "string" ? input.type : payload.type,
    id: typeof payload.eventId === "string" && payload.eventId ? payload.eventId : typeof input.id === "number" ? `ev:${input.id}` : "",
    sequence: typeof input.id === "number" ? input.id : 0,
    roomId: typeof payload.roomId === "string" ? payload.roomId : input.taskId,
    occurredAt: typeof payload.occurredAt === "string" ? payload.occurredAt : input.ts,
    source: input.source,
  };
}

/**
 * Accepts only event types this build knows. Anything else returns null so callers drop it without touching state.
 * `sseId` is the frame's `id:` line (the per-task sequence). It fills a missing `sequence` on persisted events; it is
 * never used as the event id, and never as a delta's chunk seq.
 */
export function parseActivityEvent(input: unknown, sseId?: string): ActivityEvent | null {
  const raw = unwrapEnvelope(input);
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !KNOWN_TYPES.has(type)) return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : typeof raw.eventId === "string" && raw.eventId ? raw.eventId : "";
  let sequence = typeof raw.sequence === "number" && Number.isFinite(raw.sequence) ? raw.sequence : 0;
  if (!sequence && type !== "assistant.delta" && sseId && NUMERIC.test(sseId)) sequence = Number(sseId);
  const modelMode = raw.modelMode === "mock" || raw.modelMode === "real" ? raw.modelMode : "";
  return { ...(raw as Omit<ActivityEvent, "id" | "sequence">), id, sequence, modelMode } as ActivityEvent;
}

/**
 * Identity of a persisted event for dedupe: its per-task sequence (= the SSE id it was sent with). Falls back to the
 * event id only when a sequence is missing altogether.
 */
export function streamKey(event: ActivityEvent, sseId?: string) {
  if (sseId) return sseId;
  if (event.sequence > 0) return String(event.sequence);
  return event.id ? `id:${event.id}` : "";
}

/** Numeric SSE id, or null when the id is not a sequence number. */
export function sseSequence(sseId: string | undefined) {
  return sseId && NUMERIC.test(sseId) ? Number(sseId) : null;
}

export function isTurnErrorCode(value: unknown): value is TurnErrorCode {
  return typeof value === "string" && (TURN_ERROR_CODES as readonly string[]).includes(value);
}

export function readFailure(event: ActivityEvent): Pick<TurnFailure, "errorCode" | "retryable"> | null {
  const failure = event.failure;
  if (!failure || !isTurnErrorCode(failure.errorCode)) return null;
  return { errorCode: failure.errorCode, retryable: failure.retryable === true };
}
