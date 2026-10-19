import { openRunStream, openSessionStream, type StreamOptions } from "./streams";

export type StreamState = { status: "connecting" | "live" | "reconnecting" | "rebuilding" | "ended" | "fatal"; attempt?: number; error?: unknown };
interface VisibilitySource { readonly hidden: boolean; addEventListener(type: "visibilitychange", listener: () => void): void; removeEventListener(type: "visibilitychange", listener: () => void): void }
/** Owns connection lifetime and visibility only; feature controllers own history rebuild/invalidation. */
export function createStreamController(options: Omit<StreamOptions, "signal" | "onFatal" | "onCursorExpired"> & {
  target: { runId: string } | { sessionId: string };
  onState(state: StreamState): void;
  onCursorExpired(cursor?: string): Promise<string | undefined>;
  visibility?: VisibilitySource;
}) {
  let connection: AbortController | null = null;
  let cursor = options.lastEventId;
  let stopped = true;
  let ended = false;
  let expiries = 0;
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  const visibility = options.visibility ?? (typeof document === "undefined" ? undefined : document);
  async function connect() {
    if (stopped || ended || failed) return;
    connection?.abort();
    const local = new AbortController();
    connection = local;
    options.onState({ status: "connecting" });
    try {
      const args: StreamOptions = {
        ...options, signal: local.signal, lastEventId: cursor,
        onEvent: (event, seq) => { cursor = seq ?? cursor; expiries = 0; options.onEvent(event, seq); },
        onLive: () => { expiries = 0; options.onState({ status: "live" }); },
        onReconnect: (info) => options.onState({ status: "reconnecting", attempt: info.attempt }),
        onFatal: (error) => { failed = true; options.onState({ status: "fatal", error }); },
        onEnd: (reason) => { ended = true; options.onState({ status: "ended" }); options.onEnd?.(reason); },
        onCursorExpired: (expired) => {
          if (++expiries > 1) { failed = true; options.onState({ status: "fatal", error: new Error("游标连续过期，请刷新") }); return; }
          options.onState({ status: "rebuilding" });
          void options.onCursorExpired(expired).then((next) => {
            cursor = next;
            if (stopped || local.signal.aborted) return;
            void connect();
          }, (error: unknown) => { if (!stopped && !local.signal.aborted) { failed = true; options.onState({ status: "fatal", error }); } });
        },
      };
      if ("runId" in options.target) await openRunStream({ ...args, runId: options.target.runId });
      else await openSessionStream({ ...args, sessionId: options.target.sessionId });
    } catch (error) { if (!local.signal.aborted) { failed = true; options.onState({ status: "fatal", error }); } }
  }
  function onVisibility() {
    clearTimeout(hiddenTimer);
    if (visibility?.hidden) hiddenTimer = setTimeout(() => { connection?.abort(); connection = null; if (!stopped && !ended && !failed) options.onState({ status: "reconnecting" }); }, 5 * 60_000);
    else if (!connection && !stopped && !ended && !failed) void connect();
  }
  return {
    start() { if (!stopped) return; stopped = false; ended = false; failed = false; visibility?.addEventListener("visibilitychange", onVisibility); void connect(); onVisibility(); },
    reconnect() { ended = false; failed = false; expiries = 0; void connect(); },
    stop() { stopped = true; clearTimeout(hiddenTimer); connection?.abort(); connection = null; visibility?.removeEventListener("visibilitychange", onVisibility); },
    cursor: () => cursor,
  };
}
