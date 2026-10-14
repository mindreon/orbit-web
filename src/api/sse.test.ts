import { describe, expect, it, vi } from "vitest";
import { apiError } from "../test/helpers";
import { ApiError } from "./errors";
import { readEventStream, SseParser, type EventStreamOptions, type SseFrame } from "./sse";

/**
 * Ways the SSE client can fail, each asserted below:
 *   S1 a frame is cut at a chunk boundary (inside a line, or between \r and \n) and comes out wrong or twice
 *   S2 comments, id-only frames or multi-line data are mishandled
 *   S3 a reconnect does not send Last-Event-ID, sends a stale one, or replays from the start
 *   S4 the backoff does not grow, grows without bound, or never restarts after a connection that worked
 *   S5 an expired cursor (409 EVENT_CURSOR_EXPIRED) is retried instead of handed to the caller
 *   S6 a refusal no retry can fix (401, 404) loops forever, or a 5xx is given up on
 *   S7 closing the stream leaves a request or a timer running, or a bug in the frame handler is retried as a network error
 */

const parse = (...chunks: string[]): SseFrame[] => {
  const parser = new SseParser();
  return chunks.flatMap((chunk) => parser.push(chunk));
};

describe("SseParser (S1, S2)", () => {
  it("reads frames and their ids", () => {
    expect(parse('id: 7\nevent: message.delta\ndata: {"a":1}\n\nid: 8\ndata: x\n\n')).toEqual([
      { id: "7", event: "message.delta", data: '{"a":1}' },
      { id: "8", event: "message", data: "x" },
    ]);
  });

  it("gives the same frames however the bytes are cut", () => {
    const text = "id: 1\ndata: héllo\r\ndata: two\r\n\r\n: ping\n\nid: 2\ndata: z\r\r";
    const whole = parse(text);
    expect(whole).toEqual([
      { id: "1", event: "message", data: "héllo\ntwo" },
      { id: "2", event: "message", data: "z" },
    ]);
    for (let cut = 1; cut < text.length; cut++) expect(parse(text.slice(0, cut), text.slice(cut))).toEqual(whole);
    expect(parse(...text.split(""))).toEqual(whole);
  });

  it("does not read the \\n after a chunk-final \\r as an empty line", () => {
    expect(parse("data: a\r", "\ndata: b\r\n\r\n")).toEqual([{ id: undefined, event: "message", data: "a\nb" }]);
  });

  it("ignores comments and frames without data, but keeps their ids for the next frame", () => {
    expect(parse(": keep-alive\n\nid: 5\n\ndata: x\n\n")).toEqual([{ id: "5", event: "message", data: "x" }]);
  });

  it("strips one leading space of a value and a leading BOM", () => {
    expect(parse("﻿data:  two spaces\n\n")[0].data).toBe(" two spaces");
    expect(parse("data:nospace\n\n")[0].data).toBe("nospace");
  });

  it("remembers the server's retry interval and ignores a malformed one", () => {
    const parser = new SseParser();
    parser.push("retry: 2500\n\n");
    expect(parser.retryMs).toBe(2500);
    parser.push("retry: soon\n\n");
    expect(parser.retryMs).toBe(2500);
  });
});

// ---- readEventStream -------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

/** A response whose body delivers `chunks` and then ends. */
function sse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { ...init, headers: { "Content-Type": "text/event-stream", ...init.headers } },
  );
}

type Step = Response | Error | ((signal: AbortSignal) => Response | Promise<Response>);

/** Plays `steps` as consecutive connection attempts; after the last one the stream is closed by the "caller". */
function harness(steps: Step[], overrides: Partial<EventStreamOptions> = {}) {
  const controller = new AbortController();
  const frames: SseFrame[] = [];
  const requests: Headers[] = [];
  const sleeps: number[] = [];
  const events = { cursorExpired: 0, fatal: [] as ApiError[], reconnects: [] as number[] };
  let attempt = 0;
  const run = readEventStream({
    url: "/v1/runs/r1/events",
    signal: controller.signal,
    onFrame: (frame) => frames.push(frame),
    onCursorExpired: () => void events.cursorExpired++,
    onFatal: (error) => void events.fatal.push(error),
    onReconnect: ({ attempt: n }) => void events.reconnects.push(n),
    fetch: async (_input, init) => {
      requests.push(new Headers(init?.headers));
      const step = steps[attempt++];
      if (step === undefined) {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(controller.signal) : step;
    },
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    ...overrides,
  });
  return { run, controller, frames, requests, sleeps, events };
}

describe("readEventStream resume (S3)", () => {
  it("sends Last-Event-ID of the last frame it saw when it reconnects", async () => {
    const h = harness([sse(["id: 41\ndata: a\n\nid: 42\ndata: b\n\n"]), sse(["id: 43\ndata: c\n\n"])]);
    await h.run;
    expect(h.frames.map((f) => f.id)).toEqual(["41", "42", "43"]);
    expect(h.requests[0].has("Last-Event-ID")).toBe(false);
    expect(h.requests[1].get("Last-Event-ID")).toBe("42");
    expect(h.requests[2].get("Last-Event-ID")).toBe("43");
    expect(h.requests[0].get("Accept")).toBe("text/event-stream");
  });

  it("starts from a cursor the caller already holds", async () => {
    const h = harness([sse([])], { lastEventId: "100" });
    await h.run;
    expect(h.requests[0].get("Last-Event-ID")).toBe("100");
  });

  it("keeps the cursor across a connection that failed before delivering anything", async () => {
    const h = harness([sse(["id: 9\ndata: a\n\n"]), new TypeError("down"), sse(["id: 10\ndata: b\n\n"])]);
    await h.run;
    expect(h.requests[2].get("Last-Event-ID")).toBe("9");
  });

  it("asks for the headers again on every attempt, so a renewed token is used", async () => {
    let n = 0;
    const h = harness([sse([]), sse([])], { headers: () => ({ Authorization: `Bearer t${++n}` }) });
    await h.run;
    expect(h.requests.map((r) => r.get("Authorization"))).toEqual(["Bearer t1", "Bearer t2", "Bearer t3"]);
  });
});

describe("readEventStream backoff (S4)", () => {
  it("doubles the delay while connections keep failing, up to the cap", async () => {
    const down = () => new TypeError("down");
    const h = harness([down(), down(), down(), down(), down(), down()], { backoff: { initialMs: 1000, maxMs: 5000, factor: 2 } });
    await h.run;
    // random() = 0.5 of 1000, 2000, 4000, 5000 (cap), 5000, 5000
    expect(h.sleeps).toEqual([500, 1000, 2000, 2500, 2500, 2500]);
    expect(h.events.reconnects).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("starts over after a connection that delivered a frame", async () => {
    const h = harness([new TypeError("down"), new TypeError("down"), sse(["id: 1\ndata: a\n\n"]), new TypeError("down")]);
    await h.run;
    // two failures (500, 1000), the connection that worked (back to 500), then the first failure after it (1000, not 2000).
    expect(h.sleeps).toEqual([500, 1000, 500, 1000]);
  });

  it("uses the server's retry interval as the base", async () => {
    const h = harness([sse(["retry: 4000\nid: 1\ndata: a\n\n"]), new TypeError("down")]);
    await h.run;
    expect(h.sleeps[0]).toBe(2000);
  });

  it("retries a stream that ends cleanly, as EventSource does", async () => {
    const h = harness([sse(["id: 1\ndata: a\n\n"]), sse(["id: 2\ndata: b\n\n"])]);
    await h.run;
    expect(h.frames).toHaveLength(2);
    expect(h.requests.length).toBeGreaterThanOrEqual(3);
  });
});

describe("readEventStream refusals (S5, S6)", () => {
  it("hands an expired cursor to the caller and stops", async () => {
    const h = harness([sse(["id: 1\ndata: a\n\n"]), apiError(409, "EVENT_CURSOR_EXPIRED", "游标已过期")]);
    await h.run;
    expect(h.events.cursorExpired).toBe(1);
    expect(h.requests).toHaveLength(2);
    expect(h.events.fatal).toEqual([]);
  });

  it("does not take another 409 for an expired cursor", async () => {
    const h = harness([apiError(409, "RUN_BUSY", "忙", false)]);
    await h.run;
    expect(h.events.cursorExpired).toBe(0);
    expect(h.events.fatal[0]).toMatchObject({ status: 409, code: "RUN_BUSY" });
  });

  it.each([403, 404])("stops on %i", async (status) => {
    const h = harness([apiError(status, "NOPE")]);
    await h.run;
    expect(h.requests).toHaveLength(1);
    expect(h.events.fatal[0]).toMatchObject({ status });
  });

  it.each([502, 503, 429])("retries %i", async (status) => {
    const h = harness([new Response("", { status }), sse(["id: 1\ndata: a\n\n"])]);
    await h.run;
    expect(h.frames).toHaveLength(1);
    expect(h.events.fatal).toEqual([]);
  });
});

describe("readEventStream closing (S7)", () => {
  it("stops reading when the signal aborts mid-stream", async () => {
    const hang = (signal: AbortSignal) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("id: 1\ndata: a\n\n"));
            signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    const h = harness([hang]);
    const done = h.run;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.frames).toHaveLength(1);
    h.controller.abort();
    await done;
    expect(h.requests).toHaveLength(1);
    expect(h.events.reconnects).toEqual([]);
  });

  it("stops waiting between attempts when the signal aborts", async () => {
    const controller = new AbortController();
    const started = readEventStream({
      url: "/x",
      signal: controller.signal,
      onFrame: () => undefined,
      onCursorExpired: () => undefined,
      onFatal: () => undefined,
      fetch: async () => {
        throw new TypeError("down");
      },
      backoff: { initialMs: 60_000, maxMs: 60_000, factor: 2 },
      random: () => 1 - Number.EPSILON,
    });
    setTimeout(() => controller.abort(), 5);
    await started;
  });

  it("lets an error thrown by the frame handler out instead of retrying it", async () => {
    const h = harness([sse(["id: 1\ndata: a\n\n"])], {
      onFrame: () => {
        throw new Error("handler bug");
      },
    });
    await expect(h.run).rejects.toThrow("handler bug");
    expect(h.requests).toHaveLength(1);
  });
});

// Regression cases: id-only/reset frames, expiring tokens, wrong routes, throttling and half-open sockets.
describe("SSE recovery regressions", () => {
  it("advances an id-only cursor and omits a reset cursor", async () => {
    const h = harness([sse(["id: 51\n\n"]), sse(["id:\n\n"]), sse([])]);
    await h.run;
    expect(h.requests[1].get("Last-Event-ID")).toBe("51");
    expect(h.requests[2].has("Last-Event-ID")).toBe(false);
  });

  it("renews headers and query tokens once on 401, preserving the cursor", async () => {
    let token = 0;
    const urls: string[] = [];
    const h = harness([apiError(401, "EXPIRED"), sse([])], {
      lastEventId: "42",
      url: () => { const url = `/events?token=${++token}`; urls.push(url); return url; },
    });
    await h.run;
    expect(urls.slice(0, 2)).toEqual(["/events?token=1", "/events?token=2"]);
    expect(h.requests[1].get("Last-Event-ID")).toBe("42");
    expect(h.events.fatal).toEqual([]);
  });

  it("stops after a second consecutive 401 and reports the cursor", async () => {
    const onFatal = vi.fn();
    const h = harness([apiError(401, "EXPIRED"), apiError(401, "EXPIRED")], { lastEventId: "9", onFatal });
    await h.run;
    expect(h.requests).toHaveLength(2);
    expect(onFatal).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }), "9");
  });

  it("reports the cursor on expiry", async () => {
    const onCursorExpired = vi.fn();
    const h = harness([apiError(409, "EVENT_CURSOR_EXPIRED")], { lastEventId: "9", onCursorExpired });
    await h.run;
    expect(onCursorExpired).toHaveBeenCalledWith("9");
  });

  it("rejects successful HTML responses as fatal", async () => {
    const h = harness([new Response("<html/>", { headers: { "Content-Type": "text/html" } })]);
    await h.run;
    expect(h.events.fatal[0]).toMatchObject({ code: "INVALID_EVENT_STREAM" });
    expect(h.requests).toHaveLength(1);
  });

  it.each(["3", new Date(Date.now() + 10_000).toUTCString()])("honors Retry-After %s", async (retryAfter) => {
    const h = harness([new Response("", { status: 429, headers: { "Retry-After": retryAfter } })]);
    await h.run;
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(3000);
  });

  it("cancels an idle reader and reconnects", async () => {
    const cancel = vi.fn();
    const h = harness([new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "text/event-stream" } })], { idleTimeoutMs: 5 });
    await h.run;
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.requests).toHaveLength(2);
  });
});
