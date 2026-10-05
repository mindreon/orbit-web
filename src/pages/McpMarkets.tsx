import { BadgeCheck, Eye, Globe, Server, Star } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { describeFailure, isCallerAbort } from "../lib/api";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { listMcpMarket, listMcpMarketCategories, mcpMarketIconPath, type McpMarketCategory, type McpMarketServer } from "../lib/catalog";
import { CatalogAvatar } from "../components/CatalogAvatar";
import { cn } from "../lib/cn";
import { Alert } from "../ui/Alert";
import { marketCardClass } from "../ui/card";
import { ChipRow } from "../ui/ChipRow";
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
          <CatalogAvatar src={mcpMarketIconPath(item.id)} fallback={initial} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-body font-semibold text-foreground">{item.name}</span>
              {item.verified ? <BadgeCheck aria-label="已验证" className="h-4 w-4 shrink-0 text-success-700" /> : null}
            </span>
            <span className="block truncate text-caption text-muted-foreground">
              {item.author}
              {item.categoryName ? ` · ${item.categoryName}` : ""}
            </span>
          </span>
        </span>
        <span className="mt-3 line-clamp-2 text-small leading-5 text-muted-foreground">{item.summary}</span>
        <span className="mt-auto flex items-center gap-2.5 pt-2 text-caption text-muted-foreground">
          <span className={cn("shrink-0 rounded-control px-1.5 py-0.5", item.hosted ? "bg-accent text-accent-foreground" : "bg-success-100 text-success-700")}>{item.hosted ? "Hosted" : "Local"}</span>
          <Stat label="浏览" value={item.views}>
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          </Stat>
          <Stat label="收藏" value={item.stars}>
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
          </Stat>
          {item.needsOnline ? <Globe aria-label="需要联网" className="ml-auto h-3.5 w-3.5" /> : null}
        </span>
      </Link>
  );
}

export function McpMarketCatalog({ keyword }: { keyword: string }) {
  // 目录查询等输入停下来再发；「我的连接器」的本地过滤仍然用即时 keyword。
  const debouncedKeyword = useDebouncedValue(keyword);
  const [category, setCategory] = useState("");
  const [serviceType, setServiceType] = useState<"" | "hosted" | "local">("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<McpMarketCategory[]>([]);
  const [visible, setVisible] = useState<McpMarketServer[]>([]);
  const [total, setTotal] = useState(0);
  const [stored, setStored] = useState(0);
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
    // 换筛选或卸载时 abort 上一次请求；请求作废是正常流程，不算失败。
    const controller = new AbortController();
    setLoading(true);
    listMcpMarket({ keyword: debouncedKeyword.trim(), category, serviceType, needsOnline, page }, controller.signal)
      .then((body) => {
        setVisible(body.items ?? []);
        setTotal(body.total ?? 0);
        setStored(body.stored ?? 0);
        setError("");
      })
      .catch((err: unknown) => {
        if (!isCallerAbort(err)) setError(describeFailure("读取市场目录失败", err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedKeyword, category, serviceType, needsOnline, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  const chips = useMemo(() => [{ key: "", label: "全部" }, ...categories.map((item) => ({ key: item.key, label: item.name, count: item.count }))], [categories]);
  const reset = () => setPage(1);

  return (
    <section aria-label="国内 MCP 市场" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {offline ? <Alert tone="info" className="mb-4">当前是离线部署，需要联网的服务不显示。</Alert> : null}
          <ChipRow
            label="MCP 服务分类"
            value={category}
            chips={chips}
            onChange={(key) => {
              setCategory(key);
              reset();
            }}
          />
          <div role="group" aria-label="服务类型" className="mt-3 flex items-center gap-2 text-body text-muted-foreground">
            服务类型
            {(["hosted", "local"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={serviceType === kind}
                className={cn("h-7 rounded-control px-3", serviceType === kind ? "bg-primary-100 font-medium text-primary-700" : "bg-card text-gray-700 hover:bg-gray-100")}
                onClick={() => {
                  setServiceType((value) => (value === kind ? "" : kind));
                  reset();
                }}
              >
                {kind === "hosted" ? "Hosted" : "Local"}
              </button>
            ))}
            <span className="ml-auto text-caption">共 {total} 个</span>
          </div>
          {error ? <Alert className="mt-4">{error}</Alert> : null}
          {loading && visible.length === 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-[132px]" />
              ))}
            </div>
          ) : null}
          {!loading && !error && visible.length === 0 ? (
            <p className="mt-6 text-body text-muted-foreground">{offline && stored === 0 ? "离线部署不显示需要联网的服务。这份目录里的服务都要联网。" : "没有匹配的服务。"}</p>
          ) : null}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => (
              <li key={item.id}>
                <PlazaCard item={item} />
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-start gap-2 text-caption leading-5 text-muted-foreground">
            <Server aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p>数据来源 modelscope.cn/mcp。同名只留一条，打开这一页通过接口读取已经存好的目录，只展示，不在这里连接，也不填写密钥。这里收录了 {stored} 条服务。</p>
              <p className="mt-1">提示：本广场内部分 MCP 由第三方提供。使用前，请务必评估其安全性并同意相关协议。因使用第三方 MCP 产生的任何风险需由您自行承担。</p>
            </div>
          </div>
        </div>
      </div>
      <Pagination page={current} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </section>
  );
}
