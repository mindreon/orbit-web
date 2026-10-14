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
  readonly url: string;
  /** Called before every connection attempt, so a refreshed token is picked up on reconnect. */
  readonly headers?: () => Promise<HeadersInit> | HeadersInit;
  /** Resume point for the first connection (a cursor the caller already holds). */
  readonly lastEventId?: string;
  readonly signal: AbortSignal;
  readonly onFrame: (frame: SseFrame) => void;
  /** The server dropped the cursor (`409 EVENT_CURSOR_EXPIRED`): the stream ends, and the caller rebuilds from the history endpoint. */
  readonly onCursorExpired: () => void;
  /** A refusal a retry cannot fix (401, 403, 404...). The stream ends. */
  readonly onFatal: (error: ApiError) => void;
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
 * with `Last-Event-ID`; the backoff restarts after a connection delivers a frame. The caller ends a finished run by aborting.
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

  while (!signal.aborted) {
    let delivered = false;
    let failure: unknown;
    let handlerFailure: { error: unknown } | null = null;
    try {
      const headers = new Headers(await options.headers?.());
      headers.set("Accept", "text/event-stream");
      if (lastEventId !== undefined) headers.set("Last-Event-ID", lastEventId);
      const response = await doFetch(options.url, { headers, signal });
      if (!response.ok) {
        const error = await ApiError.fromResponse(response);
        if (response.status === 409 && error.code === CURSOR_EXPIRED) return options.onCursorExpired();
        if (!error.retryable) return options.onFatal(error);
        throw error;
      }
      if (!response.body) throw new Error("响应没有正文");
      const parser = new SseParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      read: for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          delivered = true;
          if (frame.id !== undefined) lastEventId = frame.id;
          try {
            options.onFrame(frame);
          } catch (error) {
            // A bug in the handler is not a connection problem: stop reading and surface it instead of retrying forever.
            handlerFailure = { error };
            await reader.cancel().catch(() => undefined);
            break read;
          }
        }
        serverRetryMs = parser.retryMs ?? serverRetryMs;
      }
      failure = new Error("连接已关闭");
    } catch (error) {
      if (signal.aborted) return;
      failure = error;
    }
    if (handlerFailure) throw handlerFailure.error;

    failures = delivered ? 1 : failures + 1;
    const base = serverRetryMs ?? backoff.initialMs;
    const delayMs = Math.floor(random() * Math.min(backoff.maxMs, base * backoff.factor ** (failures - 1)));
    options.onReconnect?.({ attempt: failures, delayMs, error: failure });
    await sleep(delayMs, signal);
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
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
