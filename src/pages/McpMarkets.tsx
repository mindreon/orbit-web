import { useMemo, useState } from "react";
import { MCP_MARKETS, entriesForDeploy, offlineDeploy } from "../lib/mcpMarkets";

const PAGE = 12;

function marketName(id: string) {
  return MCP_MARKETS.find((item) => item.id === id)?.name ?? "";
}

export function McpMarketCatalog() {
  const [keyword, setKeyword] = useState("");
  const [shown, setShown] = useState(PAGE);
  const offline = offlineDeploy();
  const catalog = useMemo(() => entriesForDeploy(), []);

  const matched = useMemo(() => {
    const q = keyword.trim();
    if (!q) return catalog;
    const named = catalog.filter((item) => item.name.includes(q));
    const described = catalog.filter((item) => !item.name.includes(q) && item.summary.includes(q));
    return [...named, ...described];
  }, [catalog, keyword]);

  const visible = matched.slice(0, shown);

  return (
    <section aria-label="国内 MCP 市场" className="mt-10 max-w-6xl">
      <h2 className="text-lg font-medium">国内 MCP 市场</h2>
      <p className="mt-1 max-w-2xl text-sm text-[#666]">
        只收录魔搭社区 modelscope.cn/mcp。同名只留一条。打开这一页只读本地数据，只展示，不在这里连接，也不填写密钥。
      </p>
      {offline ? (
        <p className="mt-1 max-w-2xl text-sm text-[#666]">当前是离线部署，需要联网的服务不显示。</p>
      ) : null}
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
        <span className="text-xs text-[#888]">{matched.length} 个</span>
      </div>
      {matched.length === 0 ? (
        <p className="mt-4 text-sm text-[#666]">
          {offline && catalog.length === 0 ? "离线部署不显示需要联网的服务。这份目录里的服务都要联网。" : "没有匹配的服务。"}
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <li key={item.id} className="rounded-xl border border-[#ececee] bg-white p-4">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="mt-1 text-xs text-[#888]">
              {marketName(item.marketId)}
              {item.hosted ? " · 云托管" : ""}
              {item.needsOnline ? " · 需要联网" : " · 可离线使用"}
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
