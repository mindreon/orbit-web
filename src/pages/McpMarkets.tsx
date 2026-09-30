import { BadgeCheck, Eye, Globe, Search, Server, Star, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { describeFailure } from "../lib/api";
import { listMcpMarket, listMcpMarketCategories, type McpMarketCategory, type McpMarketServer } from "../lib/catalog";
import { cn } from "../lib/cn";
import { Alert } from "../ui/Alert";
import { marketCardClass } from "../ui/card";
import { CategoryPanel } from "../ui/CategoryPanel";
import { Input } from "../ui/fields";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/Skeleton";

const PAGE_SIZE = 30;

function offlineDeploy() {
  return import.meta.env.VITE_ORBIT_OFFLINE === "1";
}

function formatStat(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function Stat({ label, value, children }: { label: string; value: number; children: ReactNode }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      {children}
      {formatStat(value)}
    </span>
  );
}

function PlazaCard({ item }: { item: McpMarketServer }) {
  const initial = item.name.trim().slice(0, 1) || "M";
  return (
    <Link to={`/experts/connectors/${encodeURIComponent(item.id)}`} className={marketCardClass}>
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-accent-foreground">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">{item.name}</span>
            {item.verified ? <BadgeCheck aria-label="已验证" className="h-4 w-4 shrink-0 text-success" /> : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.author}
            {item.categoryName ? ` · ${item.categoryName}` : ""}
          </span>
        </span>
      </span>
      <span className="mb-3 mt-3 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{item.summary}</span>
      <span className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className={cn("shrink-0 rounded px-1.5 py-0.5", item.hosted ? "bg-accent text-accent-foreground" : "bg-success/10 text-success")}>{item.hosted ? "Hosted" : "Local"}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          {item.hosted ? (
            <Stat label="托管服务调用次数" value={item.calls}>
              <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
            </Stat>
          ) : null}
          <Stat label="浏览" value={item.views}>
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          </Stat>
          <Stat label="收藏" value={item.stars}>
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
          </Stat>
          {item.needsOnline ? <Globe aria-label="需要联网" className="h-3.5 w-3.5" /> : null}
        </span>
      </span>
    </Link>
  );
}

export function McpMarketCatalog() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [serviceType, setServiceType] = useState<"" | "hosted" | "local">("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<McpMarketCategory[]>([]);
  const [visible, setVisible] = useState<McpMarketServer[]>([]);
  const [total, setTotal] = useState(0);
  const [stored, setStored] = useState(0);
  const [plazaTotal, setPlazaTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const offline = offlineDeploy();
  const needsOnline = offline ? "false" : "";

  useEffect(() => {
    let gone = false;
    listMcpMarketCategories(needsOnline || undefined)
      .then((body) => {
        if (!gone) setCategories(body.items ?? []);
      })
      .catch(() => {
        if (!gone) setCategories([]);
      });
    return () => {
      gone = true;
    };
  }, [needsOnline]);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    listMcpMarket({ keyword: keyword.trim(), category, serviceType, needsOnline, page })
      .then((body) => {
        if (gone) return;
        setVisible(body.items ?? []);
        setTotal(body.total ?? 0);
        setStored(body.stored ?? 0);
        setPlazaTotal(body.plazaTotal ?? 0);
        setError("");
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取市场目录失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [keyword, category, serviceType, needsOnline, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  return (
    <section aria-label="国内 MCP 市场" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <CategoryPanel
          title="MCP 服务分类"
          value={category}
          options={categories}
          onChange={(key) => {
            setCategory(key);
            setPage(1);
          }}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted px-6 py-5">
          <div className="mx-auto max-w-6xl">
            {offline ? <Alert tone="info" className="mb-4">当前是离线部署，需要联网的服务不显示。</Alert> : null}
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative block w-full sm:w-80">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索市场服务"
                  value={keyword}
                  placeholder={`搜索 MCP 服务（共 ${total} 个）`}
                  className="pl-9"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <div role="group" aria-label="服务类型" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                服务类型
                {(["hosted", "local"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={serviceType === kind}
                    className={cn("h-8 rounded-lg border px-3", serviceType === kind ? "border-primary/40 bg-accent font-medium text-accent-foreground" : "border-border bg-card hover:bg-secondary")}
                    onClick={() => {
                      setServiceType((value) => (value === kind ? "" : kind));
                      setPage(1);
                    }}
                  >
                    {kind === "hosted" ? "Hosted" : "Local"}
                  </button>
                ))}
              </div>
            </div>
            {error ? <Alert className="mt-4">{error}</Alert> : null}
            {loading && visible.length === 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-[172px]" />
                ))}
              </div>
            ) : null}
            {!loading && !error && visible.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                {offline && stored === 0 ? "离线部署不显示需要联网的服务。这份目录里的服务都要联网。" : "没有匹配的服务。"}
              </p>
            ) : null}
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <li key={item.id}>
                  <PlazaCard item={item} />
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Server aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p>数据来源 modelscope.cn/mcp。同名只留一条，打开这一页通过接口读取已经存好的目录，只展示，不在这里连接，也不填写密钥。广场标注 {plazaTotal} 条，这里收了 {stored} 条。</p>
                <p className="mt-1">提示：本广场内部分 MCP 由第三方提供。使用前，请务必评估其安全性并同意相关协议。因使用第三方 MCP 产生的任何风险需由您自行承担。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Pagination page={current} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </section>
  );
}
