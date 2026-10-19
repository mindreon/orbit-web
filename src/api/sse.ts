import { ApiError } from "./errors";

/** One server-sent event. `id` is the cursor to resume from (the JetStream sequence of the run's stream). */
export interface SseFrame {
  readonly id?: string;
  readonly event: string;
  readonly data: string;
}

/**
 * Incremental parser of the text/event-stream format. Bytes arrive in arbitrary chunks, so a line, a frame or a CRLF pair may be
 * split anywhere; `push` returns the frames completed by the chunk. As the spec says, `id` sticks to later frames until changed.
 */
export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private event = "";
  private lastId: string | undefined;
  private retry: number | undefined;
  private skipLf = false;
  private first = true;

  /** The latest `retry:` the server sent (milliseconds), if any. */
  get retryMs(): number | undefined {
    return this.retry;
  }

  get lastEventId(): string | undefined {
    return this.lastId;
  }

  push(chunk: string): SseFrame[] {
    let text = chunk;
    if (this.first && text !== "") {
      this.first = false;
      if (text.startsWith("\uFEFF")) text = text.slice(1);
    }
    // The \n of a \r\n pair that was split between two chunks belongs to the line already ended by the \r.
    if (this.skipLf && text !== "") {
      this.skipLf = false;
      if (text.startsWith("\n")) text = text.slice(1);
    }
    this.buffer += text;

    const frames: SseFrame[] = [];
    for (;;) {
      const end = this.buffer.search(/[\r\n]/);
      if (end < 0) break;
      const line = this.buffer.slice(0, end);
      const crlf = this.buffer.startsWith("\r\n", end);
      if (this.buffer[end] === "\r" && !crlf && end === this.buffer.length - 1) this.skipLf = true;
      this.buffer = this.buffer.slice(end + (crlf ? 2 : 1));
      const frame = this.line(line);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  private line(line: string): SseFrame | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
    else if (field === "id") {
      if (!value.includes("\0")) this.lastId = value;
    } else if (field === "retry" && /^\d+$/.test(value)) this.retry = Number(value);
    return null;
  }

  private dispatch(): SseFrame | null {
    const hadData = this.data.length > 0;
    const frame: SseFrame = { id: this.lastId, event: this.event || "message", data: this.data.join("\n") };
    this.data = [];
    this.event = "";
    return hadData ? frame : null;
  }
}

export interface BackoffPolicy {
  readonly initialMs: number;
  readonly maxMs: number;
  readonly factor: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { initialMs: 1000, maxMs: 30_000, factor: 2 };

export interface EventStreamOptions {
  readonly url: string | (() => string | Promise<string>);
  /** Called before every connection attempt to refresh the token. A non-retryable ApiError (e.g. token endpoint 403/404) ends the stream via onFatal. */
  readonly headers?: () => Promise<HeadersInit> | HeadersInit;
  /** Resume point for the first connection (a cursor the caller already holds). "0" means no cursor and omits Last-Event-ID. */
  readonly lastEventId?: string;
  readonly signal: AbortSignal;
  readonly onFrame: (frame: SseFrame) => void;
  /** An explicit `end` frame stops reconnecting. Without this callback it is treated as a closed connection. */
  readonly onEnd?: (reason: string) => void;
  /** The server dropped the cursor (`409 EVENT_CURSOR_EXPIRED`): the stream ends, and the caller rebuilds from the history endpoint. */
  readonly onCursorExpired: (lastEventId: string | undefined) => void;
  /** A non-retryable ApiError ends the stream: a refusal (403, 404, or 401 after renewal), an invalid stream, or a headers() failure (e.g. token endpoint 403/404). */
  readonly onFatal: (error: ApiError, lastEventId: string | undefined) => void;
  /** No bytes (including heartbeats) in this interval: cancel the half-open connection and reconnect. */
  readonly idleTimeoutMs?: number;
  /** A successful SSE connection has been established. */
  readonly onConnected?: () => void;
  /** A connection failed or dropped and the next attempt is scheduled. */
  readonly onReconnect?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  readonly backoff?: BackoffPolicy;
  readonly fetch?: typeof fetch;
  /** Waits `ms`, resolving early (and quietly) when the signal aborts. Replaceable so tests do not have to sleep. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** In [0, 1): full jitter on the backoff, so many tabs that lost the same server do not return together. */
  readonly random?: () => number;
}

const CURSOR_EXPIRED = "EVENT_CURSOR_EXPIRED";

/**
 * Reads an SSE endpoint with `fetch` (EventSource cannot send an Authorization header). Resolves when the signal aborts, the cursor
 * expires or a fatal refusal arrives. A connection that fails or ends is retried with exponential backoff and full jitter, resuming
 * with `Last-Event-ID`; the backoff restarts after a connection delivers a frame. An `end` frame stops the stream when `onEnd` is set.
 */
export async function readEventStream(options: EventStreamOptions): Promise<void> {
  const { signal } = options;
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? abortableSleep;
  const random = options.random ?? Math.random;
  let lastEventId = options.lastEventId;
  let serverRetryMs: number | undefined;
  let failures = 0;
  let retriedUnauthorized = false;

  while (!signal.aborted) {
    let delivered = false;
    let retryAfterMs = 0;
    let failure: unknown;
    let handlerFailure: { error: unknown } | null = null;
    try {
      const headers = new Headers(await options.headers?.());
      headers.set("Accept", "text/event-stream");
      if (lastEventId && lastEventId !== "0") headers.set("Last-Event-ID", lastEventId);
      else headers.delete("Last-Event-ID");
      const url = typeof options.url === "function" ? await options.url() : options.url;
      if (signal.aborted) return;
      const response = await doFetch(url, { headers, signal });
      if (signal.aborted) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok) {
        const error = await ApiError.fromResponse(response);
        if (response.status === 401 && !retriedUnauthorized) {
          retriedUnauthorized = true;
          continue;
        }
        if (response.status === 429) retryAfterMs = retryAfter(response.headers.get("Retry-After"));
        throw error;
      }
      retriedUnauthorized = false;
      if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream") {
        await response.body?.cancel();
        throw new ApiError(response.status, { code: "INVALID_EVENT_STREAM", message: "响应不是 text/event-stream", retryable: false });
      }
      if (!response.body) throw new Error("响应没有正文");
      options.onConnected?.();
      const parser = new SseParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      let ended = false;
      let protocolError: ApiError | undefined;
      signal.addEventListener("abort", cancel, { once: true });
      try {
        read: for (;;) {
          const timer = setTimeout(cancel, options.idleTimeoutMs ?? 45_000);
          const { done, value } = await reader.read().finally(() => clearTimeout(timer));
          if (done || signal.aborted) break;
          const frames = parser.push(decoder.decode(value, { stream: true }));
          lastEventId = parser.lastEventId ?? lastEventId;
          for (const frame of frames) {
            if (signal.aborted) break read;
            delivered = true;
            let endReason: string | undefined;
            if (frame.event === "end") {
              let data: unknown;
              try {
                data = JSON.parse(frame.data);
              } catch {
                protocolError = invalidEndFrame();
                break read;
              }
              if (typeof data !== "object" || data === null || !("reason" in data) || typeof data.reason !== "string") {
                protocolError = invalidEndFrame();
                break read;
              }
              endReason = data.reason;
            }
            try {
              if (endReason !== undefined) {
                if (options.onEnd) {
                  options.onEnd(endReason);
                  ended = true;
                }
                break read;
              }
              options.onFrame(frame);
            } catch (error) {
              // A bug in the handler is not a connection problem: stop reading and surface it instead of retrying forever.
              handlerFailure = { error };
              break read;
            }
          }
          serverRetryMs = parser.retryMs ?? serverRetryMs;
        }
      } finally {
        signal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (ended) return;
      failure = protocolError ?? new Error("连接已关闭");
    } catch (error) {
      if (signal.aborted) return;
      failure = error;
    }
    if (signal.aborted) return;
    if (handlerFailure) throw handlerFailure.error;
    if (failure instanceof ApiError && failure.status === 409 && failure.code === CURSOR_EXPIRED) return options.onCursorExpired(lastEventId);
    if (failure instanceof ApiError && !failure.retryable) return options.onFatal(failure, lastEventId);

    failures = delivered ? 1 : failures + 1;
    const base = serverRetryMs ?? backoff.initialMs;
    const delayMs = Math.max(retryAfterMs, Math.floor(random() * Math.min(backoff.maxMs, base * backoff.factor ** (failures - 1))));
    options.onReconnect?.({ attempt: failures, delayMs, error: failure });
    await sleep(delayMs, signal);
  }
}

function invalidEndFrame(): ApiError {
  return new ApiError(200, { code: "INVALID_EVENT_STREAM", message: "无效的 SSE end 帧", retryable: false });
}

function retryAfter(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
