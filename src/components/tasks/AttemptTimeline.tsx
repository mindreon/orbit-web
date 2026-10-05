import type { AttemptView } from "../../lib/taskEvents";
import { StatusBadge } from "../../ui/StatusBadge";
import { Section, SectionEmpty } from "./Section";
import { attemptStatusText, failureClassText, statusTone } from "./statusText";

/** 一次执行的结构化结果：简单的字段直接列出，复杂的折成一小段 JSON。 */
function OutputBlock({ output }: { readonly output: Readonly<Record<string, unknown>> }) {
  const entries = Object.entries(output);
  const simple = entries.every(([, value]) => ["string", "number", "boolean"].includes(typeof value) && String(value).length <= 80);
  return (
    <details data-testid="attempt-output" className="mt-2 rounded-control bg-muted">
      <summary className="cursor-pointer px-2 py-1 text-small font-medium text-gray-700">执行结果（{entries.length} 项）</summary>
      {simple ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-2 pb-2 text-caption">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-words text-foreground">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-2 pb-2 font-mono text-caption text-gray-700">{JSON.stringify(output, null, 2)}</pre>
      )}
    </details>
  );
}

export function AttemptTimeline({ attempts, nameOf = (ref) => ref }: { readonly attempts: readonly AttemptView[]; /** 专家引用（id@版本）到显示名。 */ readonly nameOf?: (ref: string) => string }) {
  return (
    <Section title="执行记录" label="执行时间线">
      {attempts.length === 0 ? <SectionEmpty>尚未开始</SectionEmpty> : null}
      {attempts.map((attempt, index) => (
        <div key={attempt.attemptId} data-testid="attempt-row" data-status={attempt.status} data-attempt-no={attempt.attemptNo} title={attempt.attemptId} className="mt-2 rounded-card bg-card p-3">
          <p className="flex items-baseline justify-between gap-2 text-body font-semibold text-foreground">
            <span>第 {index + 1} 次执行</span>
            <StatusBadge tone={statusTone(attempt.status)} pulse={attempt.status === "running"}>
              {attemptStatusText[attempt.status]}
            </StatusBadge>
          </p>
          {attempt.failure ? (
            <p data-testid="attempt-failure" data-failure-class={attempt.failure.failureClass} className="mt-1 text-small text-muted-foreground">
              失败原因：{failureClassText[attempt.failure.failureClass] ?? attempt.failure.failureClass}
              {attempt.failure.message ? `：${attempt.failure.message}` : ""}
            </p>
          ) : null}
          {attempt.switchedFrom ? (
            <p data-testid="attempt-switched" className="mt-1 text-small text-muted-foreground">
              由 {nameOf(attempt.switchedFrom)} 切换而来{attempt.profile ? `，现在是 ${nameOf(attempt.profile)}` : ""}
            </p>
          ) : attempt.profile ? (
            <p className="mt-1 text-small text-muted-foreground">专家 {nameOf(attempt.profile)}</p>
          ) : null}
          {attempt.output ? <OutputBlock output={attempt.output} /> : attempt.outputTruncated ? <p data-testid="attempt-output-truncated" className="mt-2 text-small text-muted-foreground">输出过大，未在此显示</p> : null}
          {attempt.resumed > 0 ? <p className="mt-1 text-small text-muted-foreground">已恢复 {attempt.resumed} 次</p> : null}
        </div>
      ))}
    </Section>
  );
}
