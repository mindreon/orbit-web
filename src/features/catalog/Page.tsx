import { Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Asset, EntryKind } from "../../api/types";
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
import { assetBlurb, assetTitle } from "../../components/assetText";
import { conversationLink } from "./catalogItems";
export default function CatalogPage({ kind }: { kind: EntryKind }) {
  const query = useCatalog(kind); const { roles } = useIdentity();
  const canCreate = canNavigate(roles, "assets");
  const [search, setSearch] = useState("");
  const title = entryKindLabels[kind];
  const needle = search.toLowerCase();
  const matched = query.data?.items.filter(({ asset }) => `${asset.name} ${asset.display_name ?? ""} ${asset.description ?? ""}`.toLowerCase().includes(needle)) ?? [];
  // 目录导入的标识以 cat- 开头；自己创建的留在「我的」里。
  const mine = matched.filter(({ asset }) => !asset.name.startsWith("cat-"));
  const catalog = matched.filter(({ asset }) => asset.name.startsWith("cat-"));
  const createTo = kind === "team" ? "/experts/new?kind=team" : "/experts/new";
  return <div className="flex min-h-0 flex-1 flex-col bg-muted">
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <h1 className="shrink-0 text-title font-semibold text-foreground">{title}</h1>
      <label className="relative ml-auto min-w-0">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={`搜索${title}`} placeholder={`搜索${title}`} className="w-36 pl-9 sm:w-64" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {canCreate ? <Link to={createTo} className="inline-flex h-8 shrink-0 items-center rounded-control bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover">{kind === "team" ? "创建专家团" : "创建专家"}</Link> : null}
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div> : query.error ? <Alert>{describeFailure("操作失败", query.error)}{query.error && "retryable" in query.error && query.error.retryable ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert> : <>
          {query.data?.capped ? <p className="mb-4 text-small text-muted-foreground">请用资产中心搜索</p> : null}
          {mine.length ? <section aria-label={kind === "team" ? "我的专家团" : "我的专家"} className="mb-6">
            <h2 className="mb-2 text-small font-medium text-muted-foreground">{kind === "team" ? "我的专家团" : "我的专家"}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(({ asset }) => <MineCard key={asset.id} asset={asset} />)}</ul>
          </section> : null}
          {catalog.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{catalog.map(({ asset, installed }) => <AssetCard key={asset.id} asset={asset} installed={installed} conversation={conversationLink(asset)} />)}</div> : null}
          {!mine.length && !catalog.length ? <p className="py-12 text-center text-body text-muted-foreground">{search ? "没有匹配的结果" : `还没有可用的${title}`}</p> : null}
        </>}
      </div>
    </div>
  </div>;
}

function MineCard({ asset }: { asset: Asset }) {
  const title = assetTitle(asset);
  return (
    <li className="rounded-card bg-card p-4 shadow-sm">
      <div className="flex items-baseline gap-2">
        <Link to={`/assets/${asset.id}`} className="min-w-0 truncate text-body font-semibold text-foreground">{title}</Link>
        {asset.kind === "team" ? <span className="shrink-0 rounded-control bg-primary-100 px-1.5 py-0.5 text-caption font-medium text-primary-700">专家团</span> : null}
        <Link to={`/assets/${asset.id}`} className="ml-auto shrink-0 text-small text-primary-700 hover:underline">编辑</Link>
      </div>
      <p className="mt-1 line-clamp-2 text-small text-muted-foreground">{assetBlurb(asset) || "没有简介"}</p>
      <Link to={conversationLink(asset)} className="mt-2 inline-block text-small font-medium text-primary-700 hover:underline">开始对话</Link>
    </li>
  );
}
