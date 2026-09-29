import type { TaskEvent } from "../../lib/tasks";

/** Durable events only: the token stream is shown as output, not as a log line per chunk. */
export function EventLog({ events }: { readonly events: readonly TaskEvent[] }) {
  const durable = events.filter((event) => event.seq > 0);
  if (durable.length === 0) return <p className="p-5 text-sm text-slate-400">等待 TaskWorkflow 事件…</p>;
  return (
    <div className="space-y-3 p-5">
      {durable.map((event) => (
        <article key={event.event_id} data-testid="event-row" data-type={event.type} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{event.type}</span>
            <span className="text-xs text-slate-400">#{event.seq}</span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">{JSON.stringify(event.payload, null, 2)}</pre>
        </article>
      ))}
    </div>
  );
}
