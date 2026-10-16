import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import type { RunEventLike } from "./runEvents";
import { readEventStream, type EventStreamOptions } from "./sse";

/** Minimal hand-written envelope; WP9 can replace it with the generated contract type. */
export interface RunEvent extends RunEventLike {
  readonly v: 1;
  readonly run_id: string;
  readonly session_id: string;
  readonly tenant_id: string;
  readonly ts: string;
}

interface StreamToken {
  readonly stream_token: string;
  readonly expires_in: number;
}

interface StreamOptions {
  readonly client: ApiClient;
  readonly lastEventId?: string;
  readonly signal: AbortSignal;
  readonly onEvent: (event: RunEvent) => void;
  readonly onEnd?: EventStreamOptions["onEnd"];
  readonly onCursorExpired: EventStreamOptions["onCursorExpired"];
}

export function openRunStream(options: StreamOptions & { readonly runId: string }): Promise<void> {
  return openStream(`/runs/${encodeURIComponent(options.runId)}`, options);
}

export function openSessionStream(options: StreamOptions & { readonly sessionId: string }): Promise<void> {
  return openStream(`/sessions/${encodeURIComponent(options.sessionId)}`, options);
}

function openStream(path: string, options: StreamOptions): Promise<void> {
  // Browser SSE uses same-origin /v1 via the gateway proxy and global fetch; ApiClient only exposes JSON requests.
  return readEventStream({
    url: `/v1${path}/events`,
    headers: async () => {
      const token = await options.client.get<StreamToken>(`${path}/stream-token`, { signal: options.signal });
      return { Authorization: `Bearer ${token.stream_token}` };
    },
    lastEventId: options.lastEventId,
    signal: options.signal,
    onFrame: (frame) => options.onEvent(parseRunEvent(frame.data)),
    onEnd: options.onEnd ?? (() => undefined),
    onCursorExpired: options.onCursorExpired,
    onFatal: (error) => { throw error; },
  });
}

function parseRunEvent(data: string): RunEvent {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw invalidRunEvent();
  }
  if (!isRunEvent(value)) throw invalidRunEvent();
  return value;
}

/** Only the protocol version and type are checked here; the gateway validates the complete contract. */
function isRunEvent(value: unknown): value is RunEvent {
  return typeof value === "object" && value !== null && "v" in value && value.v === 1 && "type" in value && typeof value.type === "string";
}

function invalidRunEvent(): ApiError {
  return new ApiError(200, { code: "INVALID_EVENT_STREAM", message: "无效的 RunEvent 帧", retryable: false });
}
