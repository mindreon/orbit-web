import { useMemo, useState } from "react";
import { MCP_MARKETS, MCP_MARKET_ENTRIES } from "../lib/mcpMarkets";

const PAGE = 12;

const SOURCES = [
  { id: "", label: "全部来源" },
  { id: "tencent", label: "腾讯云" },
  { id: "mcpmarket", label: "MCP 星球" },
] as const;

function marketName(id: string) {
  return MCP_MARKETS.find((item) => item.id === id)?.name ?? "";
}

export function McpMarketCatalog() {
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState("");
  const [shown, setShown] = useState(PAGE);

  const matched = useMemo(() => {
    const q = keyword.trim();
    return MCP_MARKET_ENTRIES.filter((item) => {
      if (source && item.marketId !== source) return false;
      if (!q) return true;
      return item.name.includes(q) || item.summary.includes(q);
    });
  }, [keyword, source]);

  const visible = matched.slice(0, shown);

  return (
    <section aria-label="国内 MCP 市场" className="mt-10 max-w-6xl">
      <h2 className="text-lg font-medium">国内 MCP 市场</h2>
      <p className="mt-1 max-w-2xl text-sm text-[#666]">
        2026-09-27 从国内广场抄下的目录。打开这一页只读本地数据，只展示，不在这里连接，也不填写密钥。
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {MCP_MARKETS.map((item) => (
          <li key={item.id} className="rounded-xl border border-[#ececee] bg-white p-4">
            <p className="text-sm font-medium">
              {item.name}
              <span className="ml-2 text-xs font-normal text-[#888]">{item.operator}</span>
            </p>
            <p className="mt-1 text-xs text-[#888]">{item.host}</p>
            <p className="mt-2 text-sm text-[#444]">{item.summary}</p>
            <p className="mt-1 text-sm text-[#666]">{item.fit}</p>
            <p className="mt-2 text-xs text-[#888]">{item.note}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-sm font-medium">收录的服务</h3>
        <input
          aria-label="搜索市场服务"
          value={keyword}
          placeholder="搜索服务"
          className="h-9 w-56 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-3 text-sm"
          onChange={(event) => {
            setKeyword(event.target.value);
            setShown(PAGE);
          }}
        />
        <select
          aria-label="服务来源"
          value={source}
          className="h-9 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-2 text-sm"
          onChange={(event) => {
            setSource(event.target.value);
            setShown(PAGE);
          }}
        >
          {SOURCES.map((item) => (
            <option key={item.id || "all"} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[#888]">{matched.length} 个</span>
      </div>
      {matched.length === 0 ? <p className="mt-4 text-sm text-[#666]">没有匹配的服务。</p> : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <li key={item.id} className="rounded-xl border border-[#ececee] bg-white p-4">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="mt-1 text-xs text-[#888]">
              {marketName(item.marketId)}
              {item.hosted ? " · 云托管" : ""}
            </p>
            <p className="mt-2 text-sm text-[#666]">{item.summary}</p>
          </li>
        ))}
      </ul>
      {shown < matched.length ? (
        <button
          type="button"
          className="mt-3 rounded-lg bg-white px-3 py-1.5 text-sm text-[#444]"
          onClick={() => setShown((count) => count + PAGE)}
        >
          再显示一些
        </button>
      ) : null}
    </section>
  );
}
