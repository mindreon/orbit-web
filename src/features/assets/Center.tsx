import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/fields";
import { Alert } from "../../ui/Alert";
import { Skeleton } from "../../ui/Skeleton";
import { isRetryable, describeFailure } from "../../api/errors";
import { AssetCard } from "../../components/AssetCard";
import { useAssets } from "./api";
const filters = [["", "全部"], ["agent", "专家"], ["team", "专家团"], ["skill", "技能"], ["mcp_server", "MCP 服务"]] as const;
export default function AssetCenter({ mine = false }: { mine?: boolean }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<typeof filters[number][0]>(""); const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(timer); }, [search]);
  const query = useAssets({ ...(kind ? { kind } : {}), ...(debouncedSearch ? { q: debouncedSearch } : {}), ...(mine ? { owner: "me" as const } : {}) });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return <><PageHeader title={mine ? "我的" : "资产中心"} actions={<Button variant="primary" onClick={() => navigate("/assets/new")}>新建资产</Button>} /><PageBody><nav aria-label="资产范围" className="mb-4 flex gap-5 border-b border-border"><Link aria-current={!mine ? "page" : undefined} className={`pb-2 text-small ${!mine ? "border-b-2 border-primary-500 font-medium" : "text-muted-foreground"}`} to="/assets">资产中心</Link><Link aria-current={mine ? "page" : undefined} className={`pb-2 text-small ${mine ? "border-b-2 border-primary-500 font-medium" : "text-muted-foreground"}`} to="/assets/mine">我的</Link></nav><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><nav aria-label="资产类型" className="flex flex-wrap gap-1">{filters.map(([value, label]) => <button type="button" key={value} className={`rounded-control px-3 py-1.5 text-small ${kind === value ? "bg-gray-200 font-medium" : "hover:bg-secondary"}`} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</nav><Input aria-label="搜索资产" placeholder="搜索资产" className="w-60 max-w-full" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-[132px]" />)}</div> : query.error ? <Alert>{describeFailure("加载资产失败", query.error)}{isRetryable(query.error) ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert> : !items.length ? <p className="py-12 text-center text-body text-muted-foreground">{search ? "没有匹配的资产" : mine ? "你还没有资产" : "还没有可见资产"}</p> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((asset) => <AssetCard key={asset.id} asset={asset} showKind status={asset.status === "active" ? null : <span className="rounded-control bg-warning-50 px-1.5 text-caption text-warning-700">{asset.status === "suspended" ? "已停用" : "已归档"}</span>} />)}</div><div className="mt-4">{query.hasNextPage ? <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "正在加载…" : "加载更多"}</Button> : null}</div></>}</PageBody></>;
}
