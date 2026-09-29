import type { AttemptView } from "../../lib/taskEvents";
import { attemptStatusText } from "./statusText";

export function AttemptTimeline({ attempts }: { readonly attempts: readonly AttemptView[] }) {
  return (
    <section aria-label="Attempt 时间线">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attempt 时间线</h3>
      {attempts.length === 0 ? <p className="mt-2 text-xs text-slate-400">尚未开始</p> : attempts.map((attempt) => (
        <div key={attempt.attemptId} data-testid="attempt-row" data-status={attempt.status} data-attempt-no={attempt.attemptNo} className="mt-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">Attempt #{attempt.attemptNo} · {attemptStatusText[attempt.status]}</p>
          {attempt.resumed > 0 ? <p className="mt-1 text-xs text-slate-500">已恢复 {attempt.resumed} 次</p> : null}
          <p className="mt-1 text-[11px] text-slate-400">{attempt.attemptId}</p>
        </div>
      ))}
    </section>
  );
}
