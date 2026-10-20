import { Link } from "react-router";
import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { kindLabels } from "../../components/kindLabels";
import { PageHeader, PageBody } from "../../ui/PageHeader";
import { useAsset, useAssetList, QueryContent, MorePages, itemsOf } from "../assets";
import { useReviews } from "./api";
export default function Reviews() {
  const query = useReviews(); const versions = itemsOf(query);
  return <><PageHeader title="审核" /><PageBody><QueryContent query={query} empty="没有待审核的版本">{versions.length ? <DataTable name="待审核版本" headers={["资产", "版本", "提交人", "上传时间", "检查摘要"]}>{versions.map((version) => <ReviewRow key={version.id} version={version} />)}</DataTable> : null}</QueryContent><MorePages query={query} /></PageBody></>;
}
function ReviewRow({ version }: { version: S["AssetVersion"] }) {
  const asset = useAsset(version.asset_id); const checks = useAssetList<S["CheckPage"]["items"][number]>(version.asset_id, `versions/${version.id}/checks`); const reports = itemsOf(checks);
  return <tr><td><QueryContent query={asset}>{asset.data ? <><span className="mr-2 rounded-control bg-gray-100 px-1.5 text-caption">{kindLabels[asset.data.kind]}</span><Link to={`/reviews/${version.id}?asset=${version.asset_id}`} className="text-primary-700 hover:underline">{asset.data.display_name || asset.data.name}</Link><p className="font-mono text-caption text-muted-foreground">{asset.data.publisher}/{asset.data.name}</p></> : null}</QueryContent></td><td><Link className="font-mono text-primary-700 hover:underline" to={`/reviews/${version.id}?asset=${version.asset_id}`}>{version.version}</Link></td><td className="font-mono text-caption">{version.uploaded_by ?? "—"}</td><td>{new Date(version.created_at).toLocaleString("zh-CN")}</td><td><QueryContent query={checks}>{reports.length ? <div className="flex flex-wrap gap-1">{(["pass", "warn", "fail"] as const).map((status) => <span key={status} className={`rounded-control px-1.5 text-caption ${status === "pass" ? "bg-success-50 text-success-700" : status === "warn" ? "bg-warning-50 text-warning-700" : "bg-danger-50 text-danger-700"}`}>{({ pass: "通过", warn: "警告", fail: "失败" })[status]} {reports.filter((r) => r.status === status).length}</span>)}</div> : <span>还没有检查报告</span>}</QueryContent><MorePages query={checks} /></td></tr>;
}
