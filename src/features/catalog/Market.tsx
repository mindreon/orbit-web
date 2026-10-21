import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { describeFailure } from "../../api/errors";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { marketCardClass } from "../../ui/card";
import { Input } from "../../ui/fields";
import { Skeleton } from "../../ui/Skeleton";
import { cn } from "../../lib/cn";

interface Category {
  key: string;
  name: string;
  count: number;
}

interface SkillCard {
  id: string;
  handle: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  category_name: string;
  downloads: number;
  likes: number;
}

interface MCPCard {
  id: string;
  name: string;
  summary: string;
  author: string;
  category: string;
  hosted: boolean;
  calls: number;
  stars: number;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  categories: Category[];
}

const SKILL_SOURCES = [
  { id: "", label: "全部" },
  { id: "common", label: "ModelScope" },
  { id: "nexa", label: "NEXA" },
] as const;

const SKILL_SORTS = [
  { id: "downloads", label: "最热" },
  { id: "likes", label: "点赞" },
  { id: "updated", label: "最新" },
] as const;

const PAGE_SIZE = 24;

export function SkillsPage() {
  const { currentTenant } = useIdentity();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<(typeof SKILL_SOURCES)[number]["id"]>("");
  const [sort, setSort] = useState<(typeof SKILL_SORTS)[number]["id"]>("downloads");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "skills", { q, source, sort, category, page }),
    queryFn: ({ signal }) => api.get<Page<SkillCard>>("/market/skills", { signal, query: { q, source, sort, category, page, limit: PAGE_SIZE } }),
  });
  const data = query.data;
  const chips = [{ key: "", name: "全部" }, ...(data?.categories ?? [])];
  return <div className="flex min-h-0 flex-1 flex-col bg-muted">
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <h1 className="shrink-0 text-title font-semibold text-foreground">技能</h1>
      <label className="relative ml-auto min-w-0">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="搜索技能" placeholder="搜索技能" className="w-36 pl-9 sm:w-64" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
    </header>
    <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
      <div className="mx-auto min-w-0 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="来源" className="flex items-baseline gap-5">
            {SKILL_SOURCES.map((item) => <button key={item.id || "all"} type="button" role="tab" aria-selected={source === item.id} className={cn("text-title", source === item.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => { setSource(item.id); setPage(1); }}>{item.label}</button>)}
          </div>
          <div role="tablist" aria-label="排序" className="inline-flex rounded-control bg-secondary p-0.5">
            {SKILL_SORTS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={sort === item.id} className={cn("h-8 rounded-control px-3 text-body", sort === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => { setSort(item.id); setPage(1); }}>{item.label}</button>)}
          </div>
        </div>
        <div role="group" aria-label="分类" className="mt-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1">
          {chips.map((item) => <button key={item.key || "all"} type="button" aria-pressed={category === item.key} className={cn("h-8 shrink-0 rounded-control px-3 text-body", category === item.key ? "bg-primary-100 font-medium text-primary-700" : "bg-card text-gray-700 hover:bg-gray-100")} onClick={() => { setCategory(item.key); setPage(1); }}>{item.name}</button>)}
        </div>
        {query.isPending ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div> : query.error ? <Alert className="mt-4">{describeFailure("读取技能目录失败", query.error)}</Alert> : data?.items.length ? <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.items.map((item) => <li key={item.id}><Link to={`/skills/${encodeURIComponent(item.handle)}/${encodeURIComponent(item.slug)}`} className={marketCardClass}><span className="flex items-center gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-body font-semibold text-primary-700">{item.name.slice(0, 1)}</span><span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{item.name}</span></span><span className="mt-3 line-clamp-2 text-small leading-5 text-muted-foreground">{item.description || "暂无简介"}</span><span className="mt-auto flex items-center gap-2.5 pt-2 text-caption text-muted-foreground">{item.likes > 0 ? <span title="点赞">♥ {item.likes}</span> : null}{item.downloads > 0 ? <span title="下载量">{item.downloads} 次下载</span> : null}</span></Link></li>)}</ul> : <p className="mt-6 text-body text-muted-foreground">没有匹配的技能</p>}
      </div>
    </div>
    <SkillPager page={page} total={data?.total ?? 0} onPage={setPage} />
  </div>;
}

function SkillPager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const arrow = "flex h-8 w-8 items-center justify-center rounded-control bg-secondary hover:bg-gray-200 disabled:opacity-40";
  return <footer className="flex h-14 shrink-0 items-center justify-between bg-card px-4 text-body text-muted-foreground sm:px-6">
    <span>第 {from}-{to} 条 / 总共 {total} 条</span>
    <span className="flex items-center gap-2">
      <button type="button" aria-label="上一页" className={arrow} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-16 text-center text-foreground">{page} / {pages}</span>
      <button type="button" aria-label="下一页" className={arrow} disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
    </span>
  </footer>;
}

export function MCPPage() {
  return <Market kind="mcp" title="MCP" />;
}

function Market({ kind, title }: { kind: "skills" | "mcp"; title: string }) {
  const { currentTenant } = useIdentity();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, kind, { q, category, page }),
    queryFn: ({ signal }) => api.get<Page<SkillCard & MCPCard>>(`/market/${kind}`, { signal, query: { q, category, page, limit: 24 } }),
  });
  const data = query.data;
  return <div className="flex min-h-0 flex-1 flex-col bg-muted">
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <h1 className="shrink-0 text-title font-semibold text-foreground">{title}</h1>
      {data ? <span className="text-small text-muted-foreground">{data.total}</span> : null}
      <form className="relative ml-auto min-w-0" onSubmit={(event) => { event.preventDefault(); setPage(1); setQ(search.trim()); }}>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={`搜索${title}`} placeholder={`搜索${title}`} className="w-36 pl-9 sm:w-64" value={search} onChange={(event) => setSearch(event.target.value)} />
      </form>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {data?.categories?.length ? <div className="mb-4 flex min-w-0 gap-2 overflow-x-auto pb-1">
          <Chip active={category === ""} onClick={() => { setCategory(""); setPage(1); }}>全部</Chip>
          {data.categories.slice(0, 16).map((item) => <Chip key={item.key} active={category === item.key} onClick={() => { setCategory(item.key); setPage(1); }}>{item.name}</Chip>)}
        </div> : null}
        {query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div> : query.error ? <Alert>{describeFailure("读取目录失败", query.error)}</Alert> : <>
          {data?.items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.items.map((item) => <CatalogCard key={item.id} kind={kind} item={item} />)}</div> : <p className="py-12 text-center text-body text-muted-foreground">没有匹配的结果</p>}
          {data && data.total > 24 ? <div className="mt-6 flex items-center justify-center gap-3">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>上一页</Button>
            <span className="text-small text-muted-foreground">第 {page} 页</span>
            <Button size="sm" disabled={page * 24 >= data.total} onClick={() => setPage((n) => n + 1)}>下一页</Button>
          </div> : null}
        </>}
      </div>
    </div>
  </div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" className={`shrink-0 rounded-control px-2.5 py-1 text-small ${active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary"}`} onClick={onClick}>{children}</button>;
}

function CatalogCard({ kind, item }: { kind: "skills" | "mcp"; item: SkillCard & MCPCard }) {
  const title = item.name;
  const blurb = kind === "skills" ? item.description : item.summary;
  const to = kind === "skills" ? `/skills/${encodeURIComponent(item.handle)}/${encodeURIComponent(item.slug)}` : `/mcp/${encodeURIComponent(item.id)}`;
  const meta = kind === "skills" ? item.category_name : item.author;
  return <article className="flex h-full min-h-[132px] min-w-0 flex-col rounded-card bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md">
    <Link to={to} className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-body font-semibold text-primary-700">{title.slice(0, 1)}</span>
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{title}</span>
    </Link>
    <p className={`mt-3 line-clamp-2 min-h-10 text-small leading-5 ${blurb ? "text-muted-foreground" : "text-gray-400"}`}>{blurb || "暂无简介"}</p>
    <div className="mt-auto flex items-center gap-2 pt-2 text-caption text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{meta}</span>
      {kind === "mcp" ? <span className="shrink-0 rounded-control bg-gray-100 px-1.5">{item.hosted ? "Hosted" : "Local"}</span> : null}
    </div>
  </article>;
}
