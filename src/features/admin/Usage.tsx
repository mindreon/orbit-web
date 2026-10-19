import { useState } from "react";
import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { useIdentity } from "../../platform/identity";
import { canNavigate } from "../../platform/permissions";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { Field, Input, Select } from "../../ui/fields";
import { useUsage, type UsageFilters } from "./api";
import { QueryState } from "./shared";
const utcDateTime = (value?: string | null) => value ? `${new Date(value).toLocaleString("zh-CN", { timeZone: "UTC", hour12: false })} UTC` : "—";
export function Usage() {
  const { roles, principal } = useIdentity(); const { current, workspaces } = useWorkspace(); const elevated = canNavigate(roles, "tenantUsage");
  const [scope, setScope] = useState<UsageFilters["scope"]>("user"); const [workspace, setWorkspace] = useState(current?.id ?? "");
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)); const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [granularity, setGranularity] = useState<UsageFilters["granularity"]>("day"); const [group, setGroup] = useState("model_profile");
  const rangeError = !from || !to ? "请选择开始和结束日期" : from > to ? "开始日期不能晚于结束日期" : (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1 > 93 ? "时间段不能超过 93 天" : "";
  const valid = !rangeError && (scope !== "workspace" || Boolean(workspace));
  const query = useUsage({ scope, id: scope === "user" ? principal?.id : scope === "workspace" ? workspace : undefined, from: `${from}T00:00:00Z`, to: to ? nextDayStart(to) : "", granularity, group_by: group }, valid);
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-3"><Field label="范围"><Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="user">个人</option><option value="workspace">工作空间</option>{elevated ? <option value="tenant">全部</option> : null}</Select></Field>{scope === "workspace" ? <Field label="工作空间"><Select value={workspace} onChange={(e) => setWorkspace(e.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field> : null}<Field label="开始日期（UTC）"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="结束日期（UTC）"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field><Field label="粒度"><Select value={granularity} onChange={(e) => setGranularity(e.target.value as typeof granularity)}><option value="hour">小时</option><option value="day">天</option><option value="month">月</option></Select></Field><Field label="分组"><Select value={group} onChange={(e) => setGroup(e.target.value)}><option value="model_profile">模型配置档</option><option value="asset">专家或专家团</option><option value="workspace">工作空间</option><option value="principal">成员</option><option value="meter">计量项</option></Select></Field></div>{!valid ? <p className="text-small text-danger-700">{rangeError || "请选择有效的工作空间"}</p> : <QueryState query={query}>{query.data ? <UsageResults report={query.data} /> : null}</QueryState>}</div>;
}
export function UsageResults({ report }: { report: S["UsageReport"] }) {
  const items = report.items ?? []; const max = Math.max(0, ...items.map((item) => item.millicredits));
  return <div className="space-y-3"><p className="text-caption text-muted-foreground">已计算至 {utcDateTime(report.computed_through)}</p>{report.dirty_hours > 0 ? <p className="text-caption text-warning-700">有 {report.dirty_hours} 个小时的用量正在重新计算，数据可能尚未更新。</p> : null}<DataTable name="用量" headers={["时间", "分组", "计量项", "数量", "成本（积分）"]}>{items.map((item, index) => <tr key={`${item.period_start}:${index}`}><td>{utcDateTime(item.period_start)}</td><td className="font-mono">{item.model_profile_name ?? item.asset_ref ?? item.workspace_id ?? item.principal_id ?? item.member ?? "—"}</td><td className="font-mono">{item.meter ?? "—"}</td><td className="tabular-nums">{item.quantity === null ? <span title="跨计量单位不可相加">—<span className="ml-2 text-caption text-muted-foreground">跨计量单位不可相加</span></span> : item.quantity}</td><td className="min-w-32 text-right tabular-nums"><span>{item.millicredits / 1000}</span><div className="py-1" title={`${item.millicredits / 1000} 积分`}><div data-testid="usage-bar" aria-hidden="true" className="h-1.5 rounded-r-control bg-primary-100 forced-colors:bg-[Highlight]" style={{ width: `${max > 0 ? Math.max(0, item.millicredits) / max * 100 : 0}%` }} /></div></td></tr>)}</DataTable>{!items.length ? <p className="text-small text-muted-foreground">此时间段内没有用量记录。</p> : null}</div>;
}
/** The report end is exclusive and must sit on a whole hour: the inclusive end date becomes the next UTC midnight. */
export function nextDayStart(day: string): string {
  const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().replace(".000Z", "Z");
}
