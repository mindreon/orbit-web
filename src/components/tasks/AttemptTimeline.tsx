import type { AttemptView } from "../../lib/taskEvents";
import { StatusBadge } from "../../ui/StatusBadge";
import { Section, SectionEmpty } from "./Section";
import { attemptStatusText, statusTone } from "./statusText";

export function AttemptTimeline({ attempts }: { readonly attempts: readonly AttemptView[] }) {
  return (
    <Section title="执行记录" label="Attempt 时间线">
      {attempts.length === 0 ? <SectionEmpty>尚未开始</SectionEmpty> : null}
      {attempts.map((attempt) => (
        <div key={attempt.attemptId} data-testid="attempt-row" data-status={attempt.status} data-attempt-no={attempt.attemptNo} title={attempt.attemptId} className="mt-2 rounded-lg border border-border p-3">
          <p className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
            <span>Attempt #{attempt.attemptNo}</span>
            <StatusBadge tone={statusTone(attempt.status)} pulse={attempt.status === "running"}>
              {attemptStatusText[attempt.status]}
            </StatusBadge>
          </p>
          {attempt.resumed > 0 ? <p className="mt-1 text-xs text-muted-foreground">已恢复 {attempt.resumed} 次</p> : null}
        </div>
      ))}
    </Section>
  );
}
