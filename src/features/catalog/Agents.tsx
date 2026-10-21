import { Bot, ChevronLeft, ChevronRight, Cpu, Search, Sparkles, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { Asset } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { FileTree } from "../../components/files/FileTree";
import { FilePreview } from "../../components/files/preview/FilePreview";
import { textSource } from "../../components/files/preview/sources";
import { Markdown } from "../../components/markdown/Markdown";
import { assetBlurb, assetTitle } from "../../components/assetText";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { canNavigate } from "../../platform/permissions";
import { qk } from "../../platform/queryKeys";
import { Alert } from "../../ui/Alert";
import { marketCardClass } from "../../ui/card";
import { Input } from "../../ui/fields";
import { Skeleton } from "../../ui/Skeleton";
import { cn } from "../../lib/cn";
import { useCatalog } from "./api";
import { conversationLink } from "./catalogItems";

const SORTS = [
  { id: "downloads", label: "最热" },
  { id: "stars", label: "收藏" },
  { id: "updated", label: "最新" },
] as const;

const PAGE_SIZE = 24;

const FRAMEWORKS: Record<string, string> = {
  "ms-agent": "魔搭智能体",
  qwenpaw: "千问智能体",
};

interface AgentCard {
  id: string;
  handle: string;
  slug: string;
  name: string;
  description: string;
  framework: string;
  catalogues: string[];
  stars: number;
  downloads: number;
  icon_url?: string;
}

interface AgentRef {
  name: string;
  description: string;
}

interface AgentDetail extends AgentCard {
  license?: string;
  source?: string;
  updated_at?: number;
  readme: string;
  models: { name: string; supplier: string; protocol: string }[];
  mcps: AgentRef[];
  skills: AgentRef[];
  prompts: { filename: string; content: string }[];
  files: { path: string; body: string }[];
}

interface AgentPage {
  items: AgentCard[];
  total: number;
  categories: { key: string; name: string; count: number }[];
}

export function ExpertsPage() {
  const query = useCatalog("agent");
  const { roles, currentTenant } = useIdentity();
  const canCreate = canNavigate(roles, "assets");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("downloads");
  const [catalogue, setCatalogue] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const market = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "agents", { q, sort, catalogue, page }),
    queryFn: ({ signal }) => api.get<AgentPage>("/market/agents", { signal, query: { q, sort, catalogue, page, limit: PAGE_SIZE } }),
  });
  const needle = search.toLowerCase();
  const mine = query.data?.items.filter(({ asset }) => !asset.name.startsWith("cat-") && `${asset.name} ${asset.display_name ?? ""} ${asset.description ?? ""}`.toLowerCase().includes(needle)) ?? [];
  const chips = [{ key: "", name: "全部" }, ...(market.data?.categories ?? [])];
  return <div className="flex min-h-0 flex-1 flex-col bg-muted">
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <h1 className="shrink-0 text-title font-semibold text-foreground">专家</h1>
      <label className="relative ml-auto min-w-0">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="搜索专家" placeholder="搜索专家" className="w-36 pl-9 sm:w-64" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {canCreate ? <Link to="/experts/new" className="inline-flex h-8 shrink-0 items-center rounded-control bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover">创建专家</Link> : null}
    </header>
    <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
      <div className="mx-auto min-w-0 max-w-6xl">
        {query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div> : null}
        {query.error ? <Alert>{describeFailure("读取我的专家失败", query.error)}</Alert> : null}
        {mine.length ? <section aria-label="我的专家" className="mb-6">
          <h2 className="mb-2 text-small font-medium text-muted-foreground">我的专家</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(({ asset }) => <MineCard key={asset.id} asset={asset} />)}</ul>
        </section> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div role="tablist" aria-label="排序" className="inline-flex rounded-control bg-secondary p-0.5">
            {SORTS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={sort === item.id} className={cn("h-8 rounded-control px-3 text-body", sort === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => { setSort(item.id); setPage(1); }}>{item.label}</button>)}
          </div>
        </div>
        <div role="group" aria-label="分类" className="mt-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1">
          {chips.map((item) => <button key={item.key || "all"} type="button" aria-pressed={catalogue === item.key} className={cn("h-8 shrink-0 rounded-control px-3 text-body", catalogue === item.key ? "bg-primary-100 font-medium text-primary-700" : "bg-card text-gray-700 hover:bg-gray-100")} onClick={() => { setCatalogue(item.key); setPage(1); }}>{item.name}{"count" in item && item.count ? <span className="ml-1 text-caption font-normal text-muted-foreground">{item.count}</span> : null}</button>)}
        </div>
        {market.isPending ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[132px]" />)}</div> : market.error ? <Alert className="mt-4">{describeFailure("读取专家目录失败", market.error)}</Alert> : market.data?.items.length ? <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{market.data.items.map((item) => <li key={item.id}><Link to={`/experts/${encodeURIComponent(item.handle)}/${encodeURIComponent(item.slug)}`} className={marketCardClass}><span className="flex items-center gap-3"><AgentAvatar name={item.name} src={safeIcon(item.icon_url ?? "")} /><span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{item.name}</span></span><span className="mt-3 line-clamp-2 text-small leading-5 text-muted-foreground">{oneLine(item.description) || "暂无简介"}</span><span className="mt-auto flex items-center gap-2.5 pt-2 text-caption text-muted-foreground">{FRAMEWORKS[item.framework] ? <span className="shrink-0 rounded-control bg-secondary px-1.5 py-0.5">{FRAMEWORKS[item.framework]}</span> : null}{item.stars > 0 ? <span title="收藏">★ {formatCount(item.stars)}</span> : null}{item.downloads > 0 ? <span title="运行">{formatCount(item.downloads)} 次运行</span> : null}</span></Link></li>)}</ul> : <p className="mt-6 text-body text-muted-foreground">没有匹配的专家</p>}
      </div>
    </div>
    <Pager page={page} total={market.data?.total ?? 0} onPage={setPage} />
  </div>;
}

function MineCard({ asset }: { asset: Asset }) {
  const title = assetTitle(asset);
  return <li className="rounded-card bg-card p-4 shadow-sm">
    <div className="flex items-baseline gap-2">
      <Link to={`/assets/${asset.id}`} className="min-w-0 truncate text-body font-semibold text-foreground">{title}</Link>
      <Link to={`/assets/${asset.id}`} className="ml-auto shrink-0 text-small text-primary-700 hover:underline">编辑</Link>
    </div>
    <p className="mt-1 line-clamp-2 text-small text-muted-foreground">{assetBlurb(asset) || "没有指令"}</p>
    <Link to={conversationLink(asset)} className="mt-2 inline-block text-small font-medium text-primary-700 hover:underline">开始对话</Link>
  </li>;
}

export function AgentDetailPage() {
  const { handle = "", slug = "" } = useParams();
  const { currentTenant } = useIdentity();
  const [tab, setTab] = useState<"概述" | "提示词" | "配置" | "文件">("概述");
  const query = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "agent", { handle, slug }),
    queryFn: ({ signal }) => api.get<AgentDetail>(`/market/agents/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`, { signal }),
  });
  const agent = query.data;
  return <div className="flex min-h-0 flex-1 flex-col bg-card">
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <Link to="/experts" aria-label="返回专家" className="-ml-2 flex h-8 shrink-0 items-center gap-0.5 rounded-control px-2 text-body text-muted-foreground hover:bg-secondary"><ChevronLeft aria-hidden="true" className="h-4 w-4" />专家</Link>
      <span aria-hidden="true" className="-mx-2 text-gray-300">/</span>
      <h1 className="min-w-0 truncate text-title font-semibold text-foreground">专家详情</h1>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
      <section aria-label="专家详情" className="mx-auto max-w-[1000px]">
        {query.isPending ? <p className="text-body text-muted-foreground">正在读取</p> : null}
        {query.error ? <Alert>{describeFailure("读取专家失败", query.error)}</Alert> : null}
        {agent ? <AgentBody agent={agent} tab={tab} onTab={setTab} /> : null}
      </section>
    </div>
  </div>;
}

function AgentBody({ agent, tab, onTab }: { agent: AgentDetail; tab: "概述" | "提示词" | "配置" | "文件"; onTab: (tab: "概述" | "提示词" | "配置" | "文件") => void }) {
  const when = timeAgo(agent.updated_at ? agent.updated_at * 1000 : 0);
  const from = agent.source === "nexa" ? "NEXA" : agent.source === "common" ? "ModelScope" : "";
  const tabs = ["概述", "提示词", "配置", "文件"] as const;
  return <article>
    <header className="mb-8">
      <div className="mb-6 flex items-center gap-4 md:gap-6">
        <AgentAvatar name={agent.name} src={safeIcon(agent.icon_url ?? "")} large />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="min-w-0 text-heading font-semibold leading-7 text-foreground md:text-display md:leading-8">{agent.name}</h1>
          <div className="truncate font-mono text-small leading-5 text-muted-foreground" title={agent.id}>{agent.id}</div>
          <div className="flex flex-wrap items-center gap-4 text-caption font-medium leading-5 text-foreground">
            {from ? <span>来源 {from}</span> : null}
            {FRAMEWORKS[agent.framework] ? <span className="text-muted-foreground">{FRAMEWORKS[agent.framework]}</span> : null}
            {agent.stars > 0 ? <span className="text-muted-foreground">★ {formatCount(agent.stars)}</span> : null}
            {agent.downloads > 0 ? <span className="text-muted-foreground">{formatCount(agent.downloads)} 次运行</span> : null}
          </div>
        </div>
      </div>
      {oneLine(agent.description) ? <p className="mb-4 text-body leading-6 text-gray-700 [word-break:break-word]">{oneLine(agent.description)}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {agent.catalogues.map((key) => catalogueName(key) ? <Pill key={key}>{catalogueName(key)}</Pill> : null)}
        {when ? <Pill>{`${when}更新`}</Pill> : null}
        {agent.license ? <Pill>{agent.license}</Pill> : null}
      </div>
    </header>
    <div className="relative mb-6 border-b border-border">
      <div className="flex items-center gap-10 overflow-x-auto md:gap-14" role="tablist" aria-label="专家内容">
        {tabs.map((name) => {
          const on = tab === name;
          return <button key={name} type="button" role="tab" aria-selected={on} className={`relative shrink-0 cursor-pointer pb-3 text-title font-medium leading-6 ${on ? "text-foreground" : "text-muted-foreground"}`} onClick={() => onTab(name)}>{name}{on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-foreground" /> : null}</button>;
        })}
      </div>
    </div>
    {tab === "概述" ? <Overview agent={agent} /> : null}
    {tab === "提示词" ? <Prompts prompts={agent.prompts} /> : null}
    {tab === "配置" ? <Config agent={agent} /> : null}
    {tab === "文件" ? <Files files={agent.files} /> : null}
  </article>;
}

function Overview({ agent }: { agent: AgentDetail }) {
  const readme = stripFrontmatter(agent.readme);
  if (readme) return <Markdown text={readme} math={false} />;
  if (oneLine(agent.description)) return <p className="text-body leading-6 text-gray-700">{oneLine(agent.description)}</p>;
  return <p className="py-16 text-center text-body text-muted-foreground">这位专家没有说明文档</p>;
}

function Prompts({ prompts }: { prompts: AgentDetail["prompts"] }) {
  if (!prompts.length) return <p className="py-16 text-center text-body text-muted-foreground">这位专家没有声明系统提示词</p>;
  return <div className="space-y-5">
    <p className="text-small text-muted-foreground">以下是从快照中读到的提示词文件，仅用于了解这位专家的行为，不会在这里执行。</p>
    {prompts.map((prompt) => <section key={prompt.filename || prompt.content.slice(0, 24)} className="overflow-hidden rounded-card bg-muted">
      <div className="flex items-center gap-2 bg-secondary px-4 py-2 text-small font-medium text-foreground"><Bot aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{prompt.filename || "提示词"}</div>
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-4 py-3 text-small leading-6 text-gray-800">{prompt.content}</pre>
    </section>)}
  </div>;
}

function Config({ agent }: { agent: AgentDetail }) {
  return <div className="space-y-8">
    <RefList title="声明的技能" icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} refs={agent.skills} />
    <RefList title="声明的 MCP 服务" icon={<Wrench aria-hidden="true" className="h-4 w-4" />} refs={agent.mcps} />
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground"><Cpu aria-hidden="true" className="h-4 w-4" />模型</h3>
      {agent.models.length === 0 ? <p className="text-small text-muted-foreground">未声明</p> : <ul className="flex flex-wrap gap-2">{agent.models.map((model) => <li key={`${model.supplier}-${model.name}`} className="rounded-control bg-muted px-3 py-1.5 text-small text-foreground">{model.name || "未命名"}{model.supplier ? <span className="ml-1.5 text-muted-foreground">{model.supplier}</span> : null}{model.protocol ? <span className="ml-1.5 rounded-control bg-card px-1.5 py-0.5 text-caption text-muted-foreground">{model.protocol}</span> : null}</li>)}</ul>}
    </section>
  </div>;
}

function RefList({ title, icon, refs }: { title: string; icon: ReactNode; refs: AgentRef[] }) {
  return <section>
    <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground">{icon}{title}</h3>
    {refs.length === 0 ? <p className="text-small text-muted-foreground">未声明</p> : <ul className="space-y-2">{refs.map((ref) => <li key={ref.name} className="rounded-control bg-muted px-4 py-2.5"><span className="text-body font-medium text-foreground">{ref.name}</span>{ref.description ? <p className="mt-1 line-clamp-3 text-small leading-5 text-muted-foreground">{ref.description}</p> : null}</li>)}</ul>}
  </section>;
}

function Files({ files }: { files: AgentDetail["files"] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const bodies = useMemo(() => new Map(files.map((file) => [file.path, file.body])), [files]);
  const source = useMemo(() => {
    if (!selected) return null;
    const body = bodies.get(selected) ?? "";
    return textSource({ name: selected, size: new TextEncoder().encode(body).length }, body);
  }, [selected, bodies]);
  if (!files.length) return <p className="flex h-[240px] items-center justify-center text-body text-muted-foreground">目录快照没有这位专家的文件文本</p>;
  if (selected && source) return <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted"><FilePreview source={source} assumeText hideFrontmatter onBack={() => setSelected(null)} /></div>;
  return <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
    <div className="shrink-0 bg-secondary px-4 py-2 text-small font-medium text-muted-foreground">共 {files.length} 个文件</div>
    <FileTree className="flex-1 overflow-auto p-2" entries={files.map((file) => ({ path: file.path, size: new TextEncoder().encode(file.body).length }))} onOpen={(entry) => setSelected(entry.path)} />
  </div>;
}

function AgentAvatar({ name, src, large = false }: { name: string; src: string; large?: boolean }) {
  const [failed, setFailed] = useState(!src);
  return <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-primary-100 font-semibold text-primary-700", large ? "h-12 w-12 rounded-control text-title" : "h-8 w-8 rounded-full text-body")}>
    {name.trim().slice(0, 1) || "专"}
    {failed ? null : <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />}
  </span>;
}

function Pill({ children }: { children: string }) {
  return <div className="flex h-5 items-center rounded-full bg-secondary px-2"><span className="whitespace-nowrap text-caption leading-[18px] text-muted-foreground">{children}</span></div>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
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

const CATALOGUES: Record<string, string> = {
  "development-tools": "开发工具",
  others: "其他",
  marketing: "市场营销",
  education: "教育",
  finance: "金融",
  design: "设计",
  product: "产品",
  sales: "销售",
  entertainment: "娱乐",
  "life-assistant": "生活助手",
};

function catalogueName(key: string) {
  return CATALOGUES[key] ?? "";
}

function stripFrontmatter(text: string) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return text.trim();
  const rest = trimmed.slice(3);
  const close = /(^|\s)---(?=\s|$)/.exec(rest);
  const block = close ? rest.slice(0, close.index) : rest;
  const body = close ? rest.slice(close.index + close[0].length).trim() : "";
  if (body !== "") return body;
  const description = /(?:^|\s)description:\s*(.*?)\s*$/s.exec(block)?.[1] ?? "";
  return description.split(/\n\s*[A-Za-z_-]+:\s/)[0].trim();
}

function oneLine(text: string) {
  return stripFrontmatter(text).replace(/\s+/g, " ").trim();
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} 千`;
  return String(Math.round(value));
}

function timeAgo(ms: number) {
  if (!ms || ms <= 0) return "";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return "今天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

const ICON_HOSTS = new Set(["resouces.modelscope.cn", "resources.modelscope.cn", "img.alicdn.com"]);

function safeIcon(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !ICON_HOSTS.has(parsed.hostname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}
