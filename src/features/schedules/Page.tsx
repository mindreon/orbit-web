import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeFailure, isRetryable } from "../../api/errors";
import type { S } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable } from "../../components/DataTable";
import { Pager } from "../../components/Pager";
import { StatusBadge } from "../../components/StatusBadge";
import { describeCron, nextFires } from "../../lib/cron";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { toast } from "../../platform/toast/store";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { Skeleton } from "../../ui/Skeleton";
import { deleteSchedule, patchSchedule, triggerSchedule, useSchedule, useSchedules } from "./api";
import { overlapLabels, scheduleRunLabels, scheduleStatusLabels } from "./labels";
import { ScheduleForm } from "./ScheduleForm";
const date = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";
function Failure({ error, retry }: { error: unknown; retry(): void }) { return <Alert>{describeFailure("加载失败", error)}{isRetryable(error) ? <Button onClick={retry}>重试</Button> : null}</Alert>; }
export default function Page({ mode = "list" }: { mode?: "list" | "new" | "detail" | "edit" }) {
  const { scheduleId } = useParams(); const { currentTenant } = useIdentity(); const tenant = currentTenant?.id ?? null; const { current } = useWorkspace();
  const list = useSchedules(tenant, mode === "list" ? current?.id : undefined); const detail = useSchedule(tenant, scheduleId);
  const title = mode === "new" ? "新建定时任务" : mode === "edit" ? "编辑定时任务" : mode === "detail" ? detail.data?.schedule.name ?? "定时任务详情" : "定时任务";
  return <><PageHeader title={title} actions={mode === "list" && current ? <Link className="rounded-control bg-primary px-3 py-2 text-small font-medium text-primary-foreground" to="/schedules/new">新建定时任务</Link> : undefined} /><PageBody>
    {mode === "new" ? <ScheduleForm /> : mode === "list" ? !current ? <p>请先创建或选择工作空间</p> : list.isPending ? <Skeleton className="h-40" /> : list.error ? <Failure error={list.error} retry={() => void list.refetch()} /> : <><div className="divide-y divide-border rounded-card bg-card">{list.data.pages.flatMap((page) => page.items ?? []).map((item) => <ScheduleRow key={item.id} schedule={item} />)}</div>{!list.data.pages.some((page) => page.items?.length) ? <p className="text-small text-muted-foreground">没有定时任务，可以新建一个。</p> : null}<Pager hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} /></> : detail.isPending ? <Skeleton className="h-48" /> : detail.error ? <Failure error={detail.error} retry={() => void detail.refetch()} /> : detail.data ? mode === "edit" ? <ScheduleForm key={detail.data.schedule.id} schedule={detail.data.schedule} /> : <ScheduleDetail detail={detail.data} refresh={() => void detail.refetch()} /> : null}
  </PageBody></>;
}
function ScheduleRow({ schedule: item }: { schedule: S["Schedule"] }) {
  const next = useMemo(() => nextFires(item.cron, item.timezone, new Date(), 1)[0], [item.cron, item.timezone]);
  return <Link to={`/schedules/${item.id}`} className="grid min-h-14 gap-2 px-4 py-3 hover:bg-muted sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-body font-medium">{item.name}</p><p className="truncate text-caption text-muted-foreground">{item.entry_kind === "team" ? "专家团" : "专家"} · <code>{item.entry_ref}</code></p></div><div className="min-w-0"><p className="text-small">{describeCron(item.cron)}</p><p className="break-words font-mono text-caption text-muted-foreground">{item.cron} · {item.timezone}</p></div><div><StatusBadge status={item.status}>{scheduleStatusLabels[item.status]}</StatusBadge>{item.sync_pending ? <span className="ml-2 text-caption text-muted-foreground">同步中</span> : null}</div><time className="text-small tabular-nums sm:text-right">{item.status === "active" ? date(next) : "—"}</time></Link>;
}
function ScheduleDetail({ detail, refresh }: { detail: S["ScheduleDetail"]; refresh(): void }) {
  const item = detail.schedule; const navigate = useNavigate(); const cache = useQueryClient(); const { currentTenant, principal, roles } = useIdentity(); const tenant = currentTenant?.id ?? null;
  // Workspace role bindings are not exposed by /me, Workspace, or Schedule.
  const canManage = item.owner_id === principal?.id || roles.some((role) => role === "tenant.owner" || role === "tenant.admin");
  const unavailable = canManage ? undefined : "无法确认此工作空间的成员管理权限；仅任务所有者或有 workspace.members 权限者可操作";
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const triggerIntent = useIdempotencyIntent({ id: item.id, action: "trigger" });
  const statusIntent = useIdempotencyIntent({ id: item.id, action: "status", status: item.status });
  const deleteIntent = useIdempotencyIntent({ id: item.id, action: "delete" });
  async function perform(kind: "trigger" | "status" | "delete") {
    if (!canManage) return;
    const intent = kind === "trigger" ? triggerIntent : kind === "status" ? statusIntent : deleteIntent;
    setBusy(true);
    try {
      if (kind === "delete") await deleteSchedule(item.id, intent.key);
      else if (kind === "trigger") await triggerSchedule(item.id, intent.key);
      else await patchSchedule(item.id, { status: item.status === "paused" ? "active" : "paused" }, intent.key);
      intent.succeeded(); await cache.invalidateQueries({ queryKey: qk.scheduleLists(tenant) }); await cache.invalidateQueries({ queryKey: qk.schedule(tenant, item.id) });
      toast.success(kind === "trigger" ? "已请求立即运行，点击刷新查看进展" : "操作成功"); if (kind === "delete") navigate("/schedules");
    } catch (error) { toast.error(describeFailure("操作失败", error)); } finally { setBusy(false); setConfirm(false); }
  }
  const facts = [["入口", `${item.entry_kind === "team" ? "专家团" : "专家"} · ${item.entry_ref}`], ["时间", describeCron(item.cron)], ["cron", item.cron], ["时区", item.timezone], ["下次触发", date(detail.describe?.next_fire_at)], ["预算", `${item.budget_millicredits / 1000} 积分`], ["重叠策略", overlapLabels[item.overlap_policy]], ["补跑窗口", `${item.catchup_window_seconds} 秒`]];
  return <div className="space-y-6"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status}>{scheduleStatusLabels[item.status]}</StatusBadge>{item.sync_pending ? <span className="text-caption text-muted-foreground">同步中</span> : null}<Button variant="primary" disabled={busy || !canManage} title={unavailable} onClick={() => void perform("trigger")}>立即运行</Button><Button disabled={busy || !canManage} title={unavailable} onClick={() => void perform("status")}>{item.status === "paused" ? "恢复" : "暂停"}</Button>{canManage ? <Link to={`/schedules/${item.id}/edit`} className="px-3 text-small">编辑</Link> : <Button disabled title={unavailable}>编辑</Button>}<Button variant="danger" disabled={busy || !canManage} title={unavailable} onClick={() => setConfirm(true)}>删除</Button><Button variant="ghost" onClick={refresh}>刷新</Button></div>{item.description ? <p className="text-body text-muted-foreground">{item.description}</p> : null}<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-caption text-muted-foreground">{label}</dt><dd className="break-words text-small">{value}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words rounded-card bg-muted p-4 text-body">{item.prompt}</p><p className="text-caption text-muted-foreground">触发次数 {detail.describe?.num_actions ?? "—"} · 重叠跳过 {detail.describe?.skipped_overlap ?? "—"} · 超出补跑窗口 {detail.describe?.missed_catchup ?? "—"}</p><section className="space-y-3"><h2 className="text-small font-medium text-muted-foreground">最近运行</h2><DataTable name="最近运行" headers={["触发时间", "状态", "耗时", "错误码", "运行", "会话"]}>{(detail.runs ?? []).map((run) => <tr key={run.fire_at}><td>{date(run.fire_at)}</td><td><StatusBadge status={run.status}>{scheduleRunLabels[run.status]}</StatusBadge></td><td className="tabular-nums">{run.ended_at ? `${Math.max(0, (Date.parse(run.ended_at) - Date.parse(run.started_at)) / 1000)} 秒` : "—"}</td><td className="font-mono">{run.error_code ?? "—"}</td><td>{run.run_id ? <Link to={`/runs/${run.run_id}`}>查看运行</Link> : "—"}</td><td>{run.session_id ? <Link to={`/sessions/${run.session_id}`}>查看会话</Link> : "—"}</td></tr>)}</DataTable>{!detail.runs?.length ? <p className="text-small text-muted-foreground">还没有运行，立即运行后可刷新查看。</p> : null}</section>{confirm ? <ConfirmDialog name={`删除定时任务“${item.name}”`} busy={busy} onClose={() => setConfirm(false)} onConfirm={() => void perform("delete")} /> : null}</div>;
}
