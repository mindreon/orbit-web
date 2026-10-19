import { useState } from "react";
import { Link } from "react-router";
import type { EntryKind } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { useIdentity } from "../../platform/identity";
import { canNavigate } from "../../platform/permissions";
import { entryKindLabels, visibilityLabels } from "../../components/kindLabels";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/fields";
import { Skeleton } from "../../ui/Skeleton";
import { useCatalog } from "./api";
import { conversationLink } from "./catalogItems";
export default function CatalogPage({ kind }: { kind: EntryKind }) {
  const query = useCatalog(kind); const { roles } = useIdentity();
  const canCreate = canNavigate(roles, "assets");
  const [search, setSearch] = useState("");
  const title = entryKindLabels[kind];
  const items = query.data?.items.filter(({ asset }) => `${asset.name} ${asset.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <div className="min-h-0 flex-1 overflow-auto bg-muted px-4 pb-6 sm:px-6">
    <header className="flex flex-wrap items-baseline justify-between gap-3 pb-4 pt-6"><h1 className="text-title font-semibold">{title}</h1><Input aria-label={`搜索${title}`} placeholder={`搜索${title}`} className="w-60 max-w-full" value={search} onChange={(event) => setSearch(event.target.value)} /></header>
    {query.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)}</div> : query.error ? <Alert>{describeFailure("操作失败", query.error)}{query.error && "retryable" in query.error && query.error.retryable ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert> : <>
      {query.data?.capped ? <p className="mb-4 text-small text-muted-foreground">请用资产中心搜索</p> : null}
      {!items.length ? <p className="py-12 text-center text-body text-muted-foreground">{search ? "没有匹配的结果" : `还没有可用的${title}`}{canCreate ? <Link to="/assets" className="mt-2 block text-primary-700 hover:underline">去资产中心创建</Link> : null}</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(({ asset, installed }) => <article key={asset.id} className="flex min-w-0 flex-col rounded-card bg-card p-4 transition-colors duration-150 ease-out hover:bg-gray-50">
        <Link to={`/assets/${asset.id}`} className="flex min-w-0 gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-body font-semibold uppercase text-accent-foreground">{(asset.display_name || asset.name).slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><h2 className="truncate text-body font-semibold">{asset.display_name || asset.name}</h2><span className="shrink-0 rounded-control bg-gray-100 px-1.5 text-caption text-gray-700">{visibilityLabels[asset.visibility]}</span>{installed ? <span className="shrink-0 rounded-control bg-success-50 px-1.5 text-caption text-success-700">已安装</span> : null}</div><p className={`mt-1 line-clamp-2 min-h-10 text-small ${asset.description ? "text-muted-foreground" : "text-gray-400"}`}>{asset.description || "暂无简介"}</p></div></Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3"><span className="min-w-0 truncate font-mono text-caption text-gray-500">{asset.publisher}/{asset.name}</span><Link to={conversationLink(asset)} className="inline-flex h-8 shrink-0 items-center rounded-control border border-border px-3 text-small font-medium hover:bg-secondary">开始对话</Link></div>
      </article>)}</div>}
    </>}
  </div>;
}
