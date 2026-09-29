import type { TaskLiveState } from "../../lib/taskEvents";

/** What each attempt is writing (or wrote). Streamed text that may have lost chunks is marked as truncated. */
export function LiveOutput({ state }: { readonly state: TaskLiveState }) {
  const streaming = Object.entries(state.live).filter(([, text]) => text !== "");
  const finished = state.attempts.filter((attempt) => attempt.finalText);
  if (streaming.length === 0 && finished.length === 0) return null;
  return (
    <section aria-label="Agent 输出" className="space-y-2 border-b border-slate-100 p-5">
      {streaming.map(([attemptId, text]) => (
        <article key={attemptId} data-testid="live-output" className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs text-blue-700">正在输出…{state.truncated[attemptId] ? <span data-testid="truncated-badge" className="ml-2 rounded bg-amber-100 px-1 text-amber-800">已截断</span> : null}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{text}</p>
        </article>
      ))}
      {finished.map((attempt) => (
        <article key={attempt.attemptId} data-testid="final-output" className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Attempt #{attempt.attemptNo} 输出</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{attempt.finalText}</p>
        </article>
      ))}
    </section>
  );
}
