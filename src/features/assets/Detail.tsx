import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { Asset, S } from "../../api/types";
import { useAsset, useAssetList } from "./api";
import { assetTabs, conversationLink } from "./model";
import { assetStatusLabels, versionStateLabels } from "./labels";
import { AssetActions } from "./AssetActions";
import { ChannelsTab, GrantsTab, InstallsTab } from "./ManagementTabs";
import { DependentsTab } from "./DependentsTab";
import { itemsOf, MorePages, QueryContent } from "./shared";
import { kindLabels, visibilityLabels } from "../../components/kindLabels";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
export default function AssetDetail() {
  const { assetId = "" } = useParams(); const query = useAsset(assetId); return <><PageHeader title={query.data?.display_name || query.data?.name || "资产详情"} actions={query.data ? <>{query.data.status === "active" && ["agent", "team"].includes(query.data.kind) ? <Link className="rounded-control bg-primary px-4 py-2 text-small font-medium text-primary-foreground hover:bg-primary-hover" to={conversationLink(query.data)}>开始对话</Link> : null}<AssetActions asset={query.data} /></> : null} /><PageBody><QueryContent query={query}>{query.data ? <DetailContent key={query.data.id} asset={query.data} /> : null}</QueryContent></PageBody></>;
}
export function DetailContent({ asset }: { asset: Asset }) {
  const [tab, setTab] = useState("版本"); const location = useLocation();
  return <>{location.state?.created ? <Alert tone="info" className="mb-4">创建第一个版本 <Button size="sm" disabled title="版本编辑器将在 WP9h 提供">新版本</Button></Alert> : null}<section className="mb-5 flex flex-wrap items-start gap-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent text-title font-semibold uppercase text-accent-foreground">{(asset.display_name || asset.name).slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="rounded-control bg-gray-100 px-1.5 text-caption">{kindLabels[asset.kind]}</span><span className="rounded-control bg-gray-100 px-1.5 text-caption">{visibilityLabels[asset.visibility]}</span>{asset.status !== "active" ? <StatusBadge status={asset.status}>{assetStatusLabels[asset.status]}</StatusBadge> : null}</div><code className="break-all font-mono text-caption text-muted-foreground">{asset.publisher}/{asset.name}</code><p className="mt-2 max-w-reading text-body text-muted-foreground">{asset.description || "暂无简介"}</p></div></section>
    <div role="tablist" aria-label="资产详情" className="mb-4 flex gap-5 overflow-x-auto border-b border-border">{assetTabs(asset).map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-1 pb-2 text-small ${tab === item ? "border-primary-500 font-medium" : "border-transparent text-muted-foreground"}`}>{item}</button>)}</div><div role="tabpanel" aria-label={tab}>{tab === "版本" ? <Versions asset={asset} /> : tab === "通道" ? <ChannelsTab asset={asset} /> : tab === "共享" ? <GrantsTab asset={asset} /> : tab === "安装" ? <InstallsTab asset={asset} /> : <DependentsTab asset={asset} />}</div></>;
}
function Versions({ asset }: { asset: Asset }) {
  const query = useAssetList<S["AssetVersion"]>(asset.id, "versions"); const items = itemsOf(query);
  return <div className="space-y-3"><Button disabled title="版本编辑器将在后续功能包中提供">新版本</Button><QueryContent query={query} empty="还没有版本；请先创建第一个版本">{items.length ? <DataTable name="版本" headers={["版本", "状态", "创建时间"]}>{items.map((v) => <tr key={v.id}><td><Link className="font-mono text-primary-700 hover:underline" to={`/assets/${asset.id}/versions/${v.id}`}>{v.version}</Link></td><td><StatusBadge status={v.state}>{versionStateLabels[v.state]}</StatusBadge></td><td>{new Date(v.created_at).toLocaleString("zh-CN")}</td></tr>)}</DataTable> : null}</QueryContent><MorePages query={query} /></div>;
}
