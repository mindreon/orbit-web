import type { TaskEvent } from "../../lib/tasks";
import { eventTypeText, formatTime } from "./statusText";

/** Durable events only: the token stream is shown as output, not as a log line per chunk. */
export function EventLog({ events }: { readonly events: readonly TaskEvent[] }) {
  const durable = events.filter((event) => event.seq > 0);
  if (durable.length === 0) return <p className="p-5 text-sm text-muted-foreground">等待 TaskWorkflow 事件…</p>;
  return (
    <ol className="p-5">
      {durable.map((event) => (
        <li key={event.event_id} data-testid="event-row" data-type={event.type} className="relative border-l border-border pb-4 pl-5 last:pb-0">
          <span aria-hidden="true" className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary/60" />
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{eventTypeText[event.type] ?? event.type}</span>
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{event.type}</code>
            <span className="ml-auto text-xs text-muted-foreground">
              #{event.seq} {formatTime(event.occurred_at)}
            </span>
          </div>
          {Object.keys(event.payload ?? {}).length > 0 ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">查看数据</summary>
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs text-foreground/80">{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
