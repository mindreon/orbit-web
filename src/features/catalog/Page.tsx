import { useState } from "react";
import { Link } from "react-router";
import type { EntryKind } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { useIdentity } from "../../platform/identity";
import { canNavigate } from "../../platform/permissions";
import { AssetCard } from "../../components/AssetCard";
import { entryKindLabels } from "../../components/kindLabels";
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
      {!items.length ? <p className="py-12 text-center text-body text-muted-foreground">{search ? "没有匹配的结果" : `还没有可用的${title}`}{canCreate ? <Link to="/assets" className="mt-2 block text-primary-700 hover:underline">去资产中心创建</Link> : null}</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(({ asset, installed }) => <AssetCard key={asset.id} asset={asset} installed={installed} conversation={conversationLink(asset)} />)}</div>}
    </>}
  </div>;
}
