import type { TaskEvent } from "../../lib/tasks";
import { eventTypeText, formatTime } from "./statusText";

/** Durable events only: the token stream is shown as output, not as a log line per chunk. */
export function EventLog({ events }: { readonly events: readonly TaskEvent[] }) {
  const durable = events.filter((event) => event.seq > 0);
  if (durable.length === 0) return <p className="px-4 pb-4 text-body text-muted-foreground">等待 TaskWorkflow 事件…</p>;
  return (
    <ol className="px-4 pb-4">
      {durable.map((event, index) => (
        <li key={event.event_id} data-testid="event-row" data-type={event.type} className="relative pb-4 pl-5 last:pb-0">
          <span aria-hidden="true" className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary-500" />
          {index < durable.length - 1 ? <span aria-hidden="true" className="absolute bottom-0 left-[3px] top-4 w-0.5 bg-gray-200" /> : null}
          <div className="flex items-baseline gap-2 text-body">
            <span className="font-medium text-foreground">{eventTypeText[event.type] ?? event.type}</span>
            <code className="rounded-control bg-secondary px-1.5 py-0.5 font-mono text-caption text-muted-foreground">{event.type}</code>
            <span className="ml-auto text-caption text-muted-foreground">
              #{event.seq} {formatTime(event.occurred_at)}
            </span>
          </div>
          {Object.keys(event.payload ?? {}).length > 0 ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-caption text-muted-foreground hover:text-foreground">查看数据</summary>
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-control bg-muted p-3 text-caption text-gray-700">{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
