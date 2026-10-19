import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Decision, InteractionRequest, S } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { cn } from "../../lib/cn";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field, Input, Select, Textarea } from "../../ui/fields";

import { decisionChoiceLabels as choiceLabels, interactionKindLabels } from "./labels";
export function EffectChip({ effect }: { effect: S["EffectClass"] }) {
  return <span className={cn("rounded-control px-1.5 text-caption", effect === "external_write" || effect === "privileged" ? "bg-danger-50 text-danger-700" : effect === "sandbox_write" ? "bg-warning-50 text-warning-700" : "bg-gray-100 text-gray-700")}>{effect}</span>;
}
export interface InteractionCardProps {
  request: InteractionRequest; approvers: readonly string[]; principalId: string; expiresAt?: string;
  resolution?: { decision: Decision; actor: string; at?: string }; status?: S["Interaction"]["status"];
  onResolve(decision: Decision): Promise<void>;
}
function Card({ request, approvers, principalId, expiresAt, resolution, status, onResolve, children }: InteractionCardProps & { children: (decide: (decision: Decision) => Promise<void>, busy: boolean) => ReactNode }) {
  const [handled, setHandled] = useState<InteractionCardProps["resolution"]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = resolution ?? handled;
  const expired = status === "expired" || Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
  const settled = Boolean(status && !["pending", "escalated"].includes(status));
  const readOnly = !approvers.includes(principalId) || expired || settled;
  const decide = async (decision: Decision) => {
    setBusy(true); setError(undefined);
    try { await onResolve(decision); setHandled({ decision, actor: principalId, at: new Date().toISOString() }); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  };
  return <article data-interaction-id={request.interaction_id} className={cn("min-w-0 rounded-card border-l-[3px] bg-card p-4", result || expired || settled ? "border-l-gray-300" : "border-l-warning-500")}>
    {result ? <p className="flex items-baseline gap-2 text-small text-muted-foreground"><Check aria-hidden="true" className="h-4 w-4 shrink-0" /><span>已由 {result.actor === principalId ? "你" : result.actor}{result.at ? ` 于 ${new Date(result.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""} 处理：{result.decision.choice ? choiceLabels[result.decision.choice] : result.decision.answer}</span></p> : <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-small font-semibold">{interactionKindLabels[request.kind]}</h3>{expiresAt && !expired && !settled ? <time className="text-caption text-muted-foreground" dateTime={expiresAt}>{new Date(expiresAt).toLocaleString("zh-CN")} 到期</time> : null}</div>
      {request.calls?.map((call) => <div key={call.call_id} className="mb-3 space-y-2"><div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-small">{call.name}</span><EffectChip effect={call.effect_class} /></div><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-control bg-muted px-3 py-2 font-mono text-caption text-gray-700">{call.args_preview}</pre>{call.risk_reasons.length ? <ul aria-label="风险原因" className="flex flex-wrap gap-1.5">{call.risk_reasons.map((reason, i) => <li key={i} className="rounded-control bg-warning-50 px-1.5 font-mono text-caption text-warning-700">{reason}</li>)}</ul> : null}</div>)}
      {request.question ? <p className="mb-3 whitespace-pre-wrap text-body">{request.question.text}</p> : null}
      {request.effect ? <div className="mb-3 space-y-2"><p className="text-body">该外部操作在中断时结果未知</p><p className="font-mono text-small">{request.effect.tool}</p><pre className="overflow-auto whitespace-pre-wrap break-all text-caption">{request.effect.args_preview}</pre></div> : null}
      {error ? <Alert className="mb-3">{describeFailure("操作失败", error)}</Alert> : null}
      {readOnly ? <p className="text-small text-muted-foreground">{expired ? "已过期" : status === "cancelled" ? "已取消" : "等待审批"}</p> : children(decide, busy)}
    </>}
  </article>;
}
const actionClass = "min-h-11 w-full sm:min-h-9 sm:w-auto";
export function ApprovalCard(props: InteractionCardProps) {
  const [expanded, setExpanded] = useState<"always" | "deny" | null>(null);
  const [scope, setScope] = useState<"user" | "workspace">("user");
  const [pattern, setPattern] = useState("");
  const [comment, setComment] = useState("");
  return <Card {...props}>{(decide, busy) => <>
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button variant="primary" className={actionClass} disabled={busy} onClick={() => void decide({ kind: "tool_approval", choice: "allow_once" })}>允许一次</Button><Button className={actionClass} disabled={busy} onClick={() => void decide({ kind: "tool_approval", choice: "allow_session" })}>本会话允许</Button><Button variant="ghost" className={actionClass} disabled={busy} onClick={() => setExpanded(expanded === "always" ? null : "always")}>始终允许…</Button><Button variant="ghost" className={cn(actionClass, "text-danger-700 sm:ml-auto")} disabled={busy} onClick={() => setExpanded(expanded === "deny" ? null : "deny")}>拒绝</Button></div>
    {expanded === "always" ? <div className="mt-3 space-y-3"><Field label="范围"><Select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="user">我</option><option value="workspace">工作空间</option></Select></Field><Field label="参数模式"><Input value={pattern} onChange={(event) => setPattern(event.target.value)} /></Field><p className="text-caption text-muted-foreground">path.Match：* 匹配非斜杠字符，? 匹配单个字符，[范围] 匹配字符范围；匹配整个参数字符串。</p><Button className={actionClass} disabled={busy} onClick={() => void decide({ kind: "tool_approval", choice: "allow_always", scope, ...(pattern ? { arg_pattern: pattern } : {}) })}>确认始终允许</Button></div> : null}
    {expanded === "deny" ? <div className="mt-3 space-y-3"><Field label="拒绝说明"><Textarea value={comment} onChange={(event) => setComment(event.target.value)} /></Field><Button variant="ghost" className={cn(actionClass, "text-danger-700")} disabled={busy} onClick={() => void decide({ kind: "tool_approval", choice: "deny", ...(comment ? { comment } : {}) })}>确认拒绝</Button></div> : null}
  </>}</Card>;
}
export function AskUserCard(props: InteractionCardProps) {
  const [answer, setAnswer] = useState("");
  return <Card {...props}>{(decide, busy) => <div className="space-y-3"><div className="flex flex-wrap gap-2">{props.request.question?.options.map((option) => <Button key={option} size="sm" className="min-h-11 sm:min-h-0" onClick={() => setAnswer(option)}>{option}</Button>)}</div><Field label="回答"><Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} /></Field><Button variant="primary" className={actionClass} disabled={busy || !answer.trim()} onClick={() => void decide({ kind: "ask_user", answer })}>提交回答</Button></div>}</Card>;
}
export function EffectCard(props: InteractionCardProps) {
  return <Card {...props}>{(decide, busy) => <div className="flex flex-col gap-2 sm:flex-row">{(["treat_as_done", "retry", "abandon"] as const).map((choice, i) => <Button key={choice} variant={i === 0 ? "primary" : "secondary"} className={actionClass} disabled={busy} onClick={() => void decide({ kind: "effect_uncertain", choice })}>{choiceLabels[choice]}</Button>)}</div>}</Card>;
}
export function InteractionCard(props: InteractionCardProps) {
  return props.request.kind === "tool_approval" ? <ApprovalCard {...props} /> : props.request.kind === "ask_user" ? <AskUserCard {...props} /> : <EffectCard {...props} />;
}
