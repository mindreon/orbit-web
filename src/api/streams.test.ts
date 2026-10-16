import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, json } from "../test/helpers";
import { createApiClient } from "./client";
import { ApiError } from "./errors";
import { openRunStream, openSessionStream } from "./streams";

const event = { v: 1, id: "envelope-1", type: "run.completed", run_id: "r1", member: "main", segment: 1, attempt: 0, data: {} };
const stream = (text: string) => new Response(text, { headers: { "Content-Type": "text/event-stream" } });
const end = 'event: end\ndata: {"reason":"run_finished"}\n\n';

function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; headers: Headers; signal: AbortSignal | null | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    requests.push({ url: String(input), headers: new Headers(init.headers), signal: init.signal });
    return responder(String(input), init);
  };
  vi.stubGlobal("fetch", fetcher);
  const client = createApiClient({ credentials: { token: () => "login-token", tenant: () => "tenant-1", unauthorized: vi.fn() } });
  return { client, requests };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("stream adapters", () => {
  it.each([
    { open: openRunStream, ids: { runId: "r1", sessionId: "s1" }, path: "/v1/runs/r1" },
    { open: openSessionStream, ids: { runId: "r1", sessionId: "s1" }, path: "/v1/sessions/s1" },
  ])("uses a fresh bearer token for $path on reconnect and forwards JSON types and cursors", async ({ open, ids, path }) => {
    vi.useFakeTimers();
    let token = 0;
    let connections = 0;
    const { client, requests } = setup((url) => url.endsWith("/stream-token")
      ? json({ stream_token: `stream-${++token}`, expires_in: 900 })
      : stream(connections++ === 0 ? `: ping\n\nid: 42\nevent: ignored-name\ndata: ${JSON.stringify(event)}\n\n` : end));
    const onEvent = vi.fn();
    const onEnd = vi.fn();
    const signal = new AbortController().signal;
    const done = open({ client, ...ids, lastEventId: "40", signal, onEvent, onEnd, onCursorExpired: vi.fn() });
    await vi.runAllTimersAsync();
    await done;
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith("run_finished");
    expect(requests.map(({ url }) => url)).toEqual([`${path}/stream-token`, `${path}/events`, `${path}/stream-token`, `${path}/events`]);
    const tokens = requests.filter(({ url }) => url.endsWith("/stream-token"));
    expect(tokens.map(({ headers }) => headers.get("Authorization"))).toEqual(["Bearer login-token", "Bearer login-token"]);
    expect(tokens.every(({ headers }) => headers.get("X-Orbit-Tenant") === "tenant-1")).toBe(true);
    const streams = requests.filter(({ url }) => url.endsWith("/events"));
    expect(streams.map(({ headers }) => headers.get("Authorization"))).toEqual(["Bearer stream-1", "Bearer stream-2"]);
    expect(streams.map(({ headers }) => headers.get("Last-Event-ID"))).toEqual(["40", "42"]);
    expect(requests.every(({ headers, signal: sent }) => !headers.has("Idempotency-Key") && sent === signal)).toBe(true);
  });

  it("renews the token after a gateway 401", async () => {
    let token = 0;
    const { client, requests } = setup((url) => url.endsWith("/stream-token")
      ? json({ stream_token: `stream-${++token}`, expires_in: 900 })
      : token === 1 ? apiError(401, "TOKEN_INVALID") : stream(end));
    await openRunStream({ client, runId: "r1", lastEventId: "9", signal: new AbortController().signal, onEvent: vi.fn(), onEnd: vi.fn(), onCursorExpired: vi.fn() });
    expect(requests.filter(({ url }) => url.endsWith("/events")).map(({ headers }) => [headers.get("Authorization"), headers.get("Last-Event-ID")])).toEqual([
      ["Bearer stream-1", "9"], ["Bearer stream-2", "9"],
    ]);
  });

  it("hands an expired cursor to the caller without reconnecting", async () => {
    const { client, requests } = setup((url) => url.endsWith("/stream-token") ? json({ stream_token: "fresh", expires_in: 900 }) : apiError(409, "EVENT_CURSOR_EXPIRED"));
    const onCursorExpired = vi.fn();
    await openSessionStream({ client, sessionId: "s1", lastEventId: "12", signal: new AbortController().signal, onEvent: vi.fn(), onCursorExpired });
    expect(onCursorExpired).toHaveBeenCalledExactlyOnceWith("12");
    expect(requests).toHaveLength(2);
  });

  it.each(["token", "gateway"])("propagates a fatal %s refusal", async (source) => {
    const { client, requests } = setup((url) => source === "token" || url.endsWith("/events") ? apiError(403, "STREAM_FORBIDDEN") : json({ stream_token: "fresh", expires_in: 900 }));
    await expect(openRunStream({ client, runId: "r1", signal: new AbortController().signal, onEvent: vi.fn(), onCursorExpired: vi.fn() })).rejects.toMatchObject({ code: "STREAM_FORBIDDEN", status: 403 });
    expect(requests).toHaveLength(source === "token" ? 1 : 2);
  });

  it.each(['{', 'null', '[]', '{"v":2,"type":"message.delta"}', '{"v":1}', '{"v":1,"type":3}'])("rejects malformed event %s without retrying", async (data) => {
    const { client, requests } = setup((url) => url.endsWith("/stream-token") ? json({ stream_token: "fresh", expires_in: 900 }) : stream(`data: ${data}\n\n`));
    const onEvent = vi.fn();
    const done = openRunStream({ client, runId: "r1", signal: new AbortController().signal, onEvent, onCursorExpired: vi.fn() });
    await expect(done).rejects.toBeInstanceOf(ApiError);
    expect(onEvent).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
  });

  it("surfaces an onEvent error", async () => {
    const { client, requests } = setup((url) => url.endsWith("/stream-token") ? json({ stream_token: "fresh", expires_in: 900 }) : stream(`data: ${JSON.stringify(event)}\n\n`));
    const error = new Error("handler failed");
    await expect(openRunStream({ client, runId: "r1", signal: new AbortController().signal, onEvent: () => { throw error; }, onCursorExpired: vi.fn() })).rejects.toBe(error);
    expect(requests).toHaveLength(2);
  });

  it("stops while acquiring a token when aborted", async () => {
    const controller = new AbortController();
    const { client, requests } = setup(() => { controller.abort(); return json({ stream_token: "fresh", expires_in: 900 }); });
    await openRunStream({ client, runId: "r1", signal: controller.signal, onEvent: vi.fn(), onCursorExpired: vi.fn() });
    expect(requests).toHaveLength(1);
  });
});
