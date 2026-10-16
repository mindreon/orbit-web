import type { ApiClient } from "./client";
import type { RunEvent } from "./streams";

interface RunEventPage {
  readonly items: readonly RunEvent[];
  readonly next_cursor?: string;
  readonly resume_from: string;
}

interface HistoryOptions {
  readonly after?: string;
  readonly types?: readonly string[];
  readonly signal?: AbortSignal;
}

/** On cursor expiry, fetch history, replay it through the reducer from empty state, then reconnect with `lastEventId: resumeFrom`. */
export function fetchRunHistory(client: ApiClient, runId: string, options: HistoryOptions = {}) {
  return fetchHistory(client, `/runs/${encodeURIComponent(runId)}/history`, options);
}

/** On cursor expiry, fetch history, replay it through each run's reducer from empty state, then reconnect with `lastEventId: resumeFrom`. */
export function fetchSessionHistory(client: ApiClient, sessionId: string, options: HistoryOptions = {}) {
  return fetchHistory(client, `/sessions/${encodeURIComponent(sessionId)}/history`, options);
}

async function fetchHistory(client: ApiClient, path: string, options: HistoryOptions): Promise<{ events: RunEvent[]; resumeFrom: string | undefined }> {
  const events: RunEvent[] = [];
  let after = options.after;
  let resumeFrom = options.after;
  for (;;) {
    options.signal?.throwIfAborted();
    const page = await client.get<RunEventPage>(path, { query: { after, types: options.types?.length ? options.types.join(",") : undefined }, signal: options.signal });
    options.signal?.throwIfAborted();
    events.push(...page.items);
    if (page.items.length) resumeFrom = page.resume_from;
    if (!page.next_cursor) return { events, resumeFrom };
    if (page.next_cursor === after) throw new Error("History cursor did not advance");
    after = page.next_cursor;
  }
}
