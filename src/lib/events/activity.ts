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
 * assistant.delta frames are live only: they may have no id and no sequence.
 */
export type ActivityEvent = Omit<Partial<OrbitEvent>, "type" | "roomId"> & {
  type: OrbitEventType | ControlEventType;
  roomId: string;
  id: string;
  sequence: number;
  source?: string;
  role?: string;
  approvalId?: string;
  reason?: string;
  protocol?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts only event types this build knows. Anything else returns null so callers drop it without touching state.
 * `fallbackId` is the SSE `id:` line, used when the JSON body has no id.
 */
export function parseActivityEvent(raw: unknown, fallbackId?: string): ActivityEvent | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !KNOWN_TYPES.has(type)) return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : typeof raw.eventId === "string" && raw.eventId ? raw.eventId : (fallbackId ?? "");
  const sequence = typeof raw.sequence === "number" && Number.isFinite(raw.sequence) ? raw.sequence : 0;
  return { ...(raw as Omit<ActivityEvent, "id" | "sequence">), id, sequence } as ActivityEvent;
}

export function isTurnErrorCode(value: unknown): value is TurnErrorCode {
  return typeof value === "string" && (TURN_ERROR_CODES as readonly string[]).includes(value);
}

export function readFailure(event: ActivityEvent): Pick<TurnFailure, "errorCode" | "retryable"> | null {
  const failure = event.failure;
  if (!failure || !isTurnErrorCode(failure.errorCode)) return null;
  return { errorCode: failure.errorCode, retryable: failure.retryable === true };
}
