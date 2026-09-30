import type { TaskLiveState } from "../../lib/taskEvents";

/** What each attempt is writing (or wrote). Streamed text that may have lost chunks is marked as truncated. */
export function LiveOutput({ state }: { readonly state: TaskLiveState }) {
  const streaming = Object.entries(state.live).filter(([, text]) => text !== "");
  const finished = state.attempts.filter((attempt) => attempt.finalText);
  if (streaming.length === 0 && finished.length === 0) return null;
  return (
    <section aria-label="Agent 输出" className="space-y-2 border-b border-border p-5">
      {streaming.map(([attemptId, text]) => (
        <article key={attemptId} data-testid="live-output" className="rounded-lg border border-primary/30 bg-accent p-3">
          <p className="text-xs text-accent-foreground">正在输出…{state.truncated[attemptId] ? <span data-testid="truncated-badge" className="ml-2 rounded bg-warning/10 px-1 text-warning">已截断</span> : null}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{text}</p>
        </article>
      ))}
      {finished.map((attempt) => (
        <article key={attempt.attemptId} data-testid="final-output" className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Attempt #{attempt.attemptNo} 输出</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{attempt.finalText}</p>
        </article>
      ))}
    </section>
  );
}
