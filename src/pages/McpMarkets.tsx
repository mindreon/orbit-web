import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { describeFailure } from "../lib/api";
import { listMcpMarket, listMcpMarketCategories, type McpMarketCategory, type McpMarketServer } from "../lib/catalog";

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
    <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-[#8284A4]" title={label}>
      {children}
      {formatStat(value)}
    </span>
  );
}

function PlazaMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 60 60" className="h-[60px] w-[60px]">
      <rect width="60" height="60" rx="8" fill="#F7F9FD" />
      <rect x="14" y="14" width="14" height="14" rx="3" fill="#624AFF" />
      <rect x="32" y="14" width="14" height="14" rx="3" fill="#816DF8" />
      <rect x="14" y="32" width="14" height="14" rx="3" fill="#3B29B3" />
      <rect x="32" y="32" width="14" height="14" rx="3" fill="#624AFF" />
    </svg>
  );
}

function PlazaCard({ item }: { item: McpMarketServer }) {
  const categoryLabel = item.categoryName;
  const initial = item.name.trim().slice(0, 1) || "M";
  return (
    <Link
      to={`/experts/connectors/${encodeURIComponent(item.id)}`}
      className="block rounded-xl border-2 border-transparent bg-[#F7F9FD] px-[18px] py-[14px] text-inherit no-underline hover:border-[#624AFF]"
    >
      <div className="flex items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center">
            <h3 className="min-w-0 truncate text-[16px] font-semibold leading-7 text-[#27254C]">{item.name}</h3>
            <span
              className={`ml-2 inline-flex h-5 shrink-0 items-center rounded-full bg-white px-2 text-[11px] font-medium leading-5 ${item.hosted ? "text-[#3B29B3]" : "text-[#329E87]"}`}
            >
              <svg aria-hidden="true" viewBox="0 0 14 14" className="mr-1 h-3.5 w-3.5 fill-current">
                {item.hosted ? (
                  <path d="M7 2.2 8.1 5H11l-2.3 1.7.9 2.8L7 7.8 4.4 9.5l.9-2.8L3 5h2.9z" />
                ) : (
                  <path d="M3 3.5h8v5.2H3zM4.2 9.8h5.6v1H4.2z" />
                )}
              </svg>
              {item.hosted ? "Hosted" : "Local"}
              {item.verified ? (
                <span className="ml-1.5 inline-flex items-center border-l border-[#ECEDF1] pl-1.5 text-[#329E87]">
                  <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                    <path d="M4.6 8.2 2.4 6l-.8.8 3 3L10.4 4l-.8-.8z" />
                  </svg>
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex h-7 items-center gap-1 overflow-hidden">
            {categoryLabel ? (
              <span className="inline-block max-w-[180px] truncate rounded bg-white px-[5px] text-[12px] leading-5 text-[#464D5B]">{categoryLabel}</span>
            ) : null}
            {categoryLabel && item.categoryMore > 0 ? (
              <span
                aria-label={`还有 ${item.categoryMore} 个分类`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[rgba(175,156,255,0.1)] text-[12px] leading-5 text-[#816DF8]"
              >
                ···
              </span>
            ) : null}
          </div>
        </div>
        <div className="ml-3.5 mt-1.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] bg-white text-[16px] font-semibold text-[#624AFF]">
          {initial}
        </div>
      </div>
      <p className="mb-3 h-8 overflow-hidden text-[12px] font-light leading-4 text-[#8284A4]">{item.summary}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-[#8284A4]">{item.author}</span>
        <span className="inline-flex shrink-0 items-center gap-3">
          {item.hosted ? (
            <Stat label="托管服务调用次数" value={item.calls}>
              <svg aria-hidden="true" viewBox="0 0 15 15" className="h-[15px] w-[15px] fill-current">
                <path d="M3 11h2V7H3zm3.5 0h2V4h-2zM10 11h2V2h-2z" />
              </svg>
            </Stat>
          ) : null}
          <Stat label="浏览" value={item.views}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current">
              <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="1.6" strokeWidth="1.2" />
            </svg>
          </Stat>
          <Stat label="收藏" value={item.stars}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
              <path d="m8 2.2 1.6 3.4 3.7.5-2.7 2.6.7 3.7L8 10.6l-3.3 1.8.7-3.7L2.7 6.1l3.7-.5z" />
            </svg>
          </Stat>
          <span className="text-[12px] leading-4 text-[#8284A4]">{item.needsOnline ? "需要联网" : "可离线使用"}</span>
        </span>
      </div>
    </Link>
  );
}

export function McpMarketCatalog() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [hostedOn, setHostedOn] = useState(false);
  const [localOn, setLocalOn] = useState(false);
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
  const serviceType = hostedOn !== localOn ? (hostedOn ? "hosted" : "local") : "";

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

  const filtering = keyword.trim() !== "" || category !== "" || hostedOn || localOn;
  const pages = Math.max(1, Math.ceil(total / 30));
  const current = Math.min(page, pages);

  function toggleType(kind: "hosted" | "local") {
    if (kind === "hosted") setHostedOn((value) => !value);
    else setLocalOn((value) => !value);
    setPage(1);
  }

  return (
    <section aria-label="国内 MCP 市场" className="-mx-6 mt-10 bg-white px-6 py-8 text-[#27254C]">
      <div className="mb-6 flex items-center">
        <div className="mr-2 shrink-0">
          <PlazaMark />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-[18px] font-semibold leading-6">
            ModelScope
            <span className="ml-3 text-[#624AFF]">MCP 广场</span>
          </h2>
          <p className="text-[12px] leading-4 text-[#8284A4]">聚合优质MCP资源，拓展模型智能边界</p>
        </div>
      </div>
      {offline ? <p className="mb-4 text-[14px] text-[#464D5B]">当前是离线部署，需要联网的服务不显示。</p> : null}
      <div className="flex items-start">
        <aside className="sticky top-0 mr-5 hidden max-h-[calc(100vh-70px)] w-[15vw] min-w-[190px] max-w-[270px] overflow-y-auto lg:block">
          <div className="mb-5 mt-1">
            <span className="text-[16px] font-semibold text-[#27254C]">MCP 服务</span>
          </div>
          {categories.map((item) => {
            const active = category === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`mb-4 flex w-full items-center justify-between rounded-xl py-[14px] pl-5 pr-[14px] text-left ${active ? "bg-[#EFF2F9]" : "bg-[#F7F9FD] hover:bg-[#EFF2F9]"}`}
                onClick={() => {
                  setCategory(active ? "" : item.key);
                  setPage(1);
                }}
              >
                <span className={`min-w-0 truncate text-[14px] leading-5 ${active ? "font-semibold text-[#624AFF]" : "font-medium text-[#27254C]"}`}>{item.name}</span>
                <span className="ml-2 shrink-0 rounded-full bg-white px-[7px] text-[12px] font-medium leading-5 text-[#464D5B]">{item.count}</span>
              </button>
            );
          })}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center">
            <input
              aria-label="搜索市场服务"
              value={keyword}
              placeholder={`搜索MCP服务（共${total}个）`}
              className="h-9 w-full rounded-[5px] border border-[#F7F9FD] bg-[#F7F9FD] px-3 text-[14px] text-[#27254C] outline-none placeholder:text-[#8284A4] hover:border-[#6A57FF] hover:bg-white focus:border-[#6A57FF] focus:bg-white lg:w-[calc(33.333%-9px)]"
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
            />
            <div className="ml-5 flex flex-1 items-center justify-end">
              <span className="mr-2 shrink-0 text-[14px] font-medium">服务类型：</span>
              <button
                type="button"
                className={`mr-2 inline-flex h-6 items-center rounded px-2 text-[14px] ${hostedOn ? "bg-[#F1F1FD] text-[#624AFF]" : "bg-[#F7F9FD] text-[#8284A4] hover:bg-[#F1F1FD] hover:text-[#624AFF]"}`}
                onClick={() => toggleType("hosted")}
              >
                Hosted
              </button>
              <button
                type="button"
                className={`inline-flex h-6 items-center rounded px-2 text-[14px] ${localOn ? "bg-[#F1F1FD] text-[#624AFF]" : "bg-[#F7F9FD] text-[#8284A4] hover:bg-[#F1F1FD] hover:text-[#624AFF]"}`}
                onClick={() => toggleType("local")}
              >
                Local
              </button>
            </div>
          </div>
          {filtering ? (
            <div className="mb-4 flex items-center gap-2 text-[14px] text-[#8284A4]">
              <span className="whitespace-nowrap">
                共找到 <span className="text-[#624AFF]">{total}</span> 个结果
              </span>
              <button
                type="button"
                className="text-[14px] text-[#624AFF]"
                onClick={() => {
                  setKeyword("");
                  setCategory("");
                  setHostedOn(false);
                  setLocalOn(false);
                  setPage(1);
                }}
              >
                清空
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="mt-6 text-[14px] text-[#464D5B]">{error}</p>
          ) : visible.length === 0 ? (
            <p className="mt-6 text-[14px] text-[#464D5B]">
              {loading ? "正在读取目录。" : offline && stored === 0 ? "离线部署不显示需要联网的服务。这份目录里的服务都要联网。" : "没有匹配的服务。"}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
              {visible.map((item) => (
                <PlazaCard key={item.id} item={item} />
              ))}
            </div>
          )}
          {pages > 1 ? (
            <div className="mt-10 flex flex-row-reverse items-center gap-2 text-[14px] text-[#464D5B]">
              <button type="button" className="h-8 rounded bg-[#F7F9FD] px-3 disabled:opacity-40" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                下一页
              </button>
              <span>
                {page} / {pages}
              </span>
              <button type="button" className="h-8 rounded bg-[#F7F9FD] px-3 disabled:opacity-40" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                上一页
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-8 text-[12px] leading-5 text-[#8284A4]">
        <p>modelscope.cn/mcp</p>
        <p>同名只留一条。打开这一页通过接口读取已经存好的目录，只展示，不在这里连接，也不填写密钥。广场标注 {plazaTotal} 条，这里收了 {stored} 条。</p>
        <p className="mt-2">提示：本广场内部分MCP由第三方提供。使用前，请务必评估其安全性并同意相关协议。因使用第三方MCP产生的任何风险需由您自行承担。</p>
      </div>
    </section>
  );
}
