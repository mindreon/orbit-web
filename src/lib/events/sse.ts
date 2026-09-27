/**
 * fetch-based Server-Sent Events client.
 * EventSource cannot set headers or control backoff, and a new EventSource forgets the last id.
 * This client sends Last-Event-ID as a header and as the `lastEventId` query parameter on every (re)connect.
 */

export interface SseFrame {
  id: string | undefined;
  event: string;
  data: string;
}

export type StreamStatus = "connecting" | "open" | "reconnecting" | "failed";

/** Incremental parser for the text/event-stream format (WHATWG HTML, "Parsing an event stream"). */
export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private hasData = false;
  private event = "";
  private id: string | undefined;
  /** Server-suggested reconnect delay from a `retry:` field. */
  retryMs: number | null = null;

  feed(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      const char = this.buffer[i];
      if (char !== "\n" && char !== "\r") continue;
      // A trailing \r may be the first half of \r\n that has not arrived yet.
      if (char === "\r" && i === this.buffer.length - 1) break;
      const line = this.buffer.slice(start, i);
      if (char === "\r" && this.buffer[i + 1] === "\n") i += 1;
      start = i + 1;
      const frame = this.line(line);
      if (frame) frames.push(frame);
    }
    this.buffer = this.buffer.slice(start);
    return frames;
  }

  private line(line: string): SseFrame | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      this.data.push(value);
      this.hasData = true;
    } else if (field === "event") {
      this.event = value;
    } else if (field === "id") {
      if (!value.includes("\0")) this.id = value;
    } else if (field === "retry") {
      if (/^\d+$/.test(value)) this.retryMs = Number(value);
    }
    return null;
  }

  private dispatch(): SseFrame | null {
    // Named events without data still dispatch (a bare `event: reset` must reach the app).
    const frame = this.hasData || this.event ? { id: this.id, event: this.event || "message", data: this.data.join("\n") } : null;
    this.data = [];
    this.hasData = false;
    this.event = "";
    return frame;
  }
}

export interface EventStreamOptions {
  url: string;
  lastEventId: () => string | null;
  onOpen: (info: { reconnect: boolean }) => void;
  onFrame: (frame: SseFrame) => void;
  onStatus: (status: StreamStatus) => void;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
/** A connection that stayed up this long resets the backoff. */
const STABLE_MS = 5000;

export function backoffDelay(attempt: number, baseMs = BASE_DELAY_MS, random = Math.random) {
  const ceiling = Math.min(MAX_DELAY_MS, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function withLastEventId(url: string, id: string | null) {
  if (!id) return url;
  const target = new URL(url, window.location.origin);
  target.searchParams.set("lastEventId", id);
  return `${target.pathname}${target.search}`;
}

function permanentFailure(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Opens the stream and keeps it open until the returned function is called. */
export function openEventStream(options: EventStreamOptions): () => void {
  const controller = new AbortController();
  let wake: (() => void) | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  async function run() {
    let attempt = 0;
    let opened = false;
    let serverRetry: number | null = null;
    while (!controller.signal.aborted) {
      options.onStatus(opened ? "reconnecting" : "connecting");
      let openedAt = 0;
      try {
        const id = options.lastEventId();
        const headers: Record<string, string> = { accept: "text/event-stream" };
        if (id) headers["last-event-id"] = id;
        const response = await fetch(withLastEventId(options.url, id), {
          headers,
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          if (permanentFailure(response.status)) {
            options.onStatus("failed");
            return;
          }
          throw new Error(`events ${response.status}`);
        }
        openedAt = Date.now();
        options.onOpen({ reconnect: opened });
        opened = true;
        options.onStatus("open");
        const parser = new SseParser();
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const frame of parser.feed(value)) options.onFrame(frame);
          if (parser.retryMs !== null) serverRetry = parser.retryMs;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (controller.signal.aborted) return;
      attempt = openedAt && Date.now() - openedAt > STABLE_MS ? 1 : attempt + 1;
      options.onStatus("reconnecting");
      await sleep(backoffDelay(attempt, serverRetry ?? BASE_DELAY_MS));
    }
  }

  void run();
  return () => {
    controller.abort();
    wake?.();
  };
}
