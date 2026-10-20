import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import type { Asset, S } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { fileDiff, type FileChange } from "../../lib/diff";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field, Textarea } from "../../ui/fields";
import { Checks, ManifestSummary, Permissions, VersionRefs, QueryContent, allAssetPages, useAsset, versionStateLabels } from "../assets";
import { useReview, useDecision } from "./api";
import { FileDiff } from "./FileDiff";
export default function ReviewPage() {
  const { versionId = "" } = useParams(); const [search] = useSearchParams(); const query = useReview(versionId, search.get("asset"));
  return <><PageHeader title={query.data ? `审核 · ${query.data.version}` : "审核详情"} back={{ to: "/reviews", label: "审核" }} /><PageBody><QueryContent query={query}>{query.data ? <ReviewContent version={query.data} /> : null}</QueryContent></PageBody></>;
}
function ReviewContent({ version }: { version: S["AssetVersion"] }) {
  const asset = useAsset(version.asset_id); const { currentTenant } = useIdentity();
  const comparison = useQuery({ queryKey: qk.assetVersion(currentTenant?.id ?? null, version.asset_id, version.id, "stable-comparison"), queryFn: async ({ signal }) => {
    const channels = await allAssetPages<S["ChannelPage"]["items"][number]>(`/assets/${version.asset_id}/channels`, signal);
    const stable = channels.find((c) => c.channel === "stable");
    const before = stable ? await api.get<S["AssetVersion"]>(`/assets/${version.asset_id}/versions/${stable.version_id}`, { signal }) : undefined;
    const afterFiles = await allAssetPages<S["AssetFile"]>(`/assets/${version.asset_id}/versions/${version.id}/files`, signal);
    const beforeFiles = before ? await allAssetPages<S["AssetFile"]>(`/assets/${version.asset_id}/versions/${before.id}/files`, signal) : [];
    return { before, changes: fileDiff(beforeFiles, afterFiles) };
  } });
  return <QueryContent query={asset}>{asset.data ? <><div className="mb-4 flex flex-wrap items-center gap-3"><Link className="text-primary-700 hover:underline" to={`/assets/${asset.data.id}`}>{asset.data.display_name || asset.data.name}</Link><code className="font-mono text-caption text-muted-foreground">{asset.data.publisher}/{asset.data.name}</code><StatusBadge status={version.state}>{versionStateLabels[version.state]}</StatusBadge></div><div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"><div className="min-w-0 space-y-5"><section><h2 className="mb-2 text-small font-medium text-muted-foreground">清单摘要</h2><ManifestSummary manifest={version.manifest} /></section>{["agent", "team"].includes(asset.data.kind) ? <section><h2 className="mb-2 text-small font-medium text-muted-foreground">技能与 MCP</h2><VersionRefs manifest={version.manifest} /></section> : null}<QueryContent query={comparison}>{comparison.data ? <DiffSet asset={asset.data} version={version} previous={comparison.data.before} changes={comparison.data.changes} /> : null}</QueryContent></div><aside className="contents lg:sticky lg:top-0 lg:block lg:space-y-5 lg:rounded-card lg:bg-card lg:p-4"><div className={`order-last rounded-card bg-card p-3 lg:static lg:order-none lg:border-0 lg:p-0 lg:shadow-none ${version.state === "in_review" ? "sticky bottom-0 z-10 border border-border shadow-[0_-6px_16px_-8px_rgb(0_0_0/0.18)]" : ""}`}><DecisionPanel version={version} ownerId={asset.data.owner_id} /></div><Checks assetId={asset.data.id} versionId={version.id} /><section><h2 className="mb-2 text-small font-medium text-muted-foreground">权限对比</h2><QueryContent query={comparison}>{comparison.data ? <PermissionComparison before={comparison.data.before?.permissions} after={version.permissions} /> : null}</QueryContent></section></aside></div></> : null}</QueryContent>;
}
function DiffSet({ asset, version, previous, changes }: { asset: Asset; version: S["AssetVersion"]; previous?: S["AssetVersion"]; changes: FileChange[] }) {
  return <section className="space-y-3"><h2 className="text-small font-medium">新增 {changes.filter((f) => f.status === "added").length} 个文件 · 修改 {changes.filter((f) => f.status === "changed").length} 个 · 删除 {changes.filter((f) => f.status === "removed").length} 个</h2><p className="text-caption text-muted-foreground">对比 stable {previous?.version ?? "（无已发布版本）"}</p>{changes.map((change) => <FileDiff key={change.path} assetId={asset.id} versionId={version.id} previousId={previous?.id} change={change} />)}{!changes.length ? <p className="text-small text-muted-foreground">没有文件差异</p> : null}</section>;
}
export function DecisionPanel({ version, ownerId }: { version: S["AssetVersion"]; ownerId: string }) {
  const { principal } = useIdentity(); const own = version.uploaded_by === principal?.id || ownerId === principal?.id; const [comment, setComment] = useState(""); const [decision, setDecision] = useState<S["ReviewInput"]["decision"] | null>(null); const write = useDecision(version.asset_id, version.id); const intent = useIdempotencyIntent({ version: version.id, decision, comment });
  const disabled = own || version.state !== "in_review" || write.isPending || write.isSuccess;
  return <section className="space-y-2 lg:space-y-3"><h2 className="hidden text-small font-medium lg:block">审核决定</h2>{version.state !== "in_review" && !write.isSuccess ? <p className="text-small text-muted-foreground">该版本{versionStateLabels[version.state]}，审核已结束</p> : <>{own ? <p className="text-small text-muted-foreground">不能审核自己的资产</p> : <Field label="审核意见"><Textarea rows={1} maxLength={4000} className="lg:min-h-24" value={comment} disabled={disabled} onChange={(e) => setComment(e.target.value)} /></Field>}<div className="flex flex-wrap gap-2 lg:flex-col">{([ ["approve", "通过"], ["request_changes", "要求修改"], ["reject", "拒绝"] ] as const).map(([value, label]) => <Button key={value} variant={value === "approve" ? "primary" : value === "reject" ? "danger" : "secondary"} disabled={disabled} onClick={() => setDecision(value)}>{label}</Button>)}</div></>}{write.error ? <Alert>{describeFailure("提交决定失败", write.error)}</Alert> : null}{write.isSuccess ? <p role="status" className="text-small text-success-700">审核决定已提交</p> : null}{decision ? <ConfirmDialog name={`提交“${({ approve: "通过", request_changes: "要求修改", reject: "拒绝" })[decision]}”决定`} busy={write.isPending} onClose={() => setDecision(null)} onConfirm={() => write.mutate({ input: { decision, comment }, key: intent.key }, { onSuccess: () => { intent.succeeded(); setDecision(null); } })} /> : null}</section>;
}
function PermissionComparison({ before, after }: { before?: S["EffectivePermissions"]; after: S["EffectivePermissions"] }) {
  const names: Record<string, string> = { network: "网络", data_scopes: "数据", tools_builtin: "内置工具", effect_classes: "副作用", secrets: "密钥声明", sandbox_profile: "沙箱配置" };
  return <><div className="mb-3"><Permissions value={after} /></div><dl className="space-y-2 text-small">{Object.entries(names).map(([key, label]) => { const old = before?.[key as keyof typeof before]; const next = after[key as keyof typeof after]; const changed = JSON.stringify(old) !== JSON.stringify(next); return <div key={key} className={`rounded-control p-2 ${changed ? "bg-warning-50" : ""}`}><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono text-caption">{old === undefined ? "无" : JSON.stringify(old)} → {next === undefined ? "无" : JSON.stringify(next)}</dd></div>; })}</dl></>;
}
