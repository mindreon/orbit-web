import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ApiError, describeFailure, isRetryable } from "../../api/errors";
import type { Run } from "../../api/types";
import { NotFound } from "../../components/NotFound";
import { StatusBadge } from "../../components/StatusBadge";
import { StreamStatus } from "../../components/StreamStatus";
import { Markdown } from "../../components/markdown/Markdown";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { canViewRunOps } from "../../platform/permissions";
import { qk } from "../../platform/queryKeys";
import { toast } from "../../platform/toast/store";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { TeamBoard, useTeam } from "../teams";
import { isActiveRun, useRun, useRunResources } from "./api";
import { runStateLabels, triggerLabels } from "./labels";
import { CostTable, credits, dateTime, EffectsTable, InteractionList, SegmentTable } from "./Tables";
import { Timeline } from "./Timeline";
import { useRunReplay } from "./useRunReplay";
function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0"><h2 className="mb-4 flex items-baseline gap-2 text-title font-semibold">{title}{count ? <span className="text-caption font-normal text-muted-foreground">{count}</span> : null}</h2>{children}</section>;
}
function QueryContent({ query, children }: { query: { isPending: boolean; error: unknown; refetch(): unknown }; children: ReactNode }) {
  if (query.error) return <Alert>{describeFailure("读取失败", query.error)}{isRetryable(query.error) ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert>;
  return query.isPending ? <Skeleton className="h-24" /> : children;
}
function MemberTimeline({ run, replay, interactions, principalId }: { run: Run; replay: ReturnType<typeof useRunReplay>; interactions: Parameters<typeof Timeline>[0]["interactions"]; principalId: string }) {
  const team = useTeam(run.id, isActiveRun(run.status)); const [member, setMember] = useState<string>();
  return <><QueryContent query={team}><div aria-label="按成员过滤" className="mb-4 flex flex-wrap gap-1">{[undefined, ...(team.data?.members.map((item) => item.name) ?? [])].map((value) => <button key={value ?? "all"} type="button" aria-pressed={member === value} onClick={() => setMember(value)} className={`rounded-control px-3 py-1.5 text-small ${member === value ? "bg-gray-200 font-medium" : "hover:bg-gray-100"} ${value ? "font-mono" : ""}`}>{value ?? "全部"}</button>)}</div></QueryContent><ReadOnlyTimeline run={run} replay={replay} interactions={interactions} principalId={principalId} member={member} /></>;
}
function ReadOnlyTimeline({ run, replay, interactions, principalId, member }: { run: Run; replay: ReturnType<typeof useRunReplay>; interactions: Parameters<typeof Timeline>[0]["interactions"]; principalId: string; member?: string }) {
  return <div data-testid="replay-timeline" className="max-w-reading"><Timeline state={replay.state} runStatus={run.status} interactions={interactions} principalId={principalId} readOnly member={member} onResolve={async () => {}} /></div>;
}
function RunReplay({ run }: { run: Run }) {
  const { currentTenant, principal, platformOperator } = useIdentity(); const tenant = currentTenant?.id ?? null;
  const client = useQueryClient(); const resources = useRunResources(run, tenant);
  const replay = useRunReplay(run.id, tenant, isActiveRun(run.status));
  const action = useMutation({ mutationFn: (kind: "cancel" | "pause" | "resume") => api.post(`/runs/${run.id}/${kind}`), onSuccess: () => client.invalidateQueries({ queryKey: qk.run(tenant, run.id) }), onError: (error) => toast.error(describeFailure("操作失败", error)) });
  const duration = run.started_at ? `${Math.max(0, Math.round((Date.parse(run.ended_at ?? new Date().toISOString()) - Date.parse(run.started_at)) / 1000))} 秒` : "—";
  const triggerLabel = Object.hasOwn(triggerLabels, run.trigger) ? triggerLabels[run.trigger as keyof typeof triggerLabels] : undefined;
  const facts = [["触发方式", triggerLabel ?? run.trigger], ["开始", dateTime(run.started_at)], ["结束", dateTime(run.ended_at)], ["时长", duration], ["预算 已用/上限", `${credits(run.used_millicredits)} / ${credits(run.budget_millicredits)}`], ["成本", credits(resources.cost.data?.total_millicredits ?? run.used_millicredits)]];
  const timelineProps = { run, replay, interactions: resources.interactions.data?.items ?? [], principalId: principal?.id ?? "" };
  const team = resources.session.data?.entry_kind === "team";
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-8 px-4 py-6 sm:px-6">
    <header className="space-y-4"><Link to={`/sessions/${run.session_id}`} className="text-small text-muted-foreground hover:text-foreground">← 返回会话</Link><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex min-w-0 items-center gap-2"><StatusBadge status={run.status}>{runStateLabels[run.status]}</StatusBadge><button title="复制运行编号" className="min-w-0 truncate font-mono text-small" onClick={() => { void navigator.clipboard.writeText(run.id).then(() => toast.success("已复制"), () => toast.error("复制失败")); }}>{run.id}</button></h1><div className="flex gap-2">{isActiveRun(run.status) ? <><Button size="sm" disabled={action.isPending} onClick={() => action.mutate("cancel")}>停止</Button>{run.status !== "queued" ? <Button size="sm" disabled={action.isPending} onClick={() => action.mutate(run.status === "paused" ? "resume" : "pause")}>{run.status === "paused" ? "继续" : "暂停"}</Button> : null}</> : null}</div></div><dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-caption text-muted-foreground">{label}</dt><dd className={`break-words text-body tabular-nums ${label === "触发方式" && !triggerLabel ? "font-mono" : ""}`}>{value}</dd></div>)}</dl>{run.error_code ? <Alert><span className="font-mono">{run.error_code}</span></Alert> : null}{run.summary && !team ? <Markdown text={run.summary} /> : null}</header>
    {team ? <Section title="专家团任务板"><TeamBoard runId={run.id} active={isActiveRun(run.status)} teamSignal={replay.state.teamSignal} /></Section> : null}
    <Section title="时间线">{isActiveRun(run.status) || replay.stream.status === "fatal" ? <div className="mb-4"><StreamStatus {...replay.stream} onReconnect={replay.reconnect} /></div> : null}<QueryContent query={resources.session}>{replay.stream.status === "rebuilding" ? <Skeleton className="h-40" /> : team ? <MemberTimeline {...timelineProps} /> : <ReadOnlyTimeline {...timelineProps} />}</QueryContent></Section>
    <Section title="段" count={resources.segments.data ? `${resources.segments.data.length} 段` : undefined}><QueryContent query={resources.segments}><SegmentTable items={resources.segments.data ?? []} /></QueryContent></Section>
    <Section title="工具副作用"><QueryContent query={resources.effects}><EffectsTable items={resources.effects.data ?? []} /></QueryContent></Section>
    <Section title="审批记录"><QueryContent query={resources.interactions}><InteractionList items={resources.interactions.data?.items ?? []} principalId={principal?.id ?? ""} /></QueryContent></Section>
    <Section title="成本"><QueryContent query={resources.cost}>{resources.cost.data ? <CostTable cost={resources.cost.data} /> : null}</QueryContent></Section>
    {canViewRunOps(platformOperator, run.ops) && run.ops ? <details className="min-w-0 text-small"><summary className="cursor-pointer text-muted-foreground">运维信息</summary><dl className="mt-3 space-y-2 break-all font-mono"><div><dt>trace_id</dt><dd>{run.ops.trace_id ?? "—"}</dd></div><div><dt>workflow_id</dt><dd>{run.ops.temporal_workflow_id}</dd></div>{[["Temporal", run.ops.temporal_url], ["trace", run.ops.trace_url]].map(([label, url]) => url && /^https?:\/\//i.test(url) ? <div key={label}><dt>{label}</dt><dd><a className="underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></dd></div> : null)}</dl></details> : null}
  </main>;
}
export default function Page() {
  const { runId = "" } = useParams(); const { currentTenant } = useIdentity(); const query = useRun(runId, currentTenant?.id ?? null);
  if (query.error instanceof ApiError && [403, 404].includes(query.error.status)) return <NotFound />;
  if (!query.data) return <div className="mx-auto w-full max-w-5xl p-6"><QueryContent query={query}><Skeleton className="h-48" /></QueryContent></div>;
  return <RunReplay key={`${currentTenant?.id}:${runId}`} run={query.data} />;
}
