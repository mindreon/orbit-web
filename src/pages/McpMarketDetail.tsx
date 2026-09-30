import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { describeFailure } from "../lib/api";
import { Alert } from "../ui/Alert";
import { PageHeader } from "../ui/PageHeader";
import { getMcpMarket, type McpMarketDetail, type McpMarketTool } from "../lib/catalog";

function formatStat(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function ReadmeBody({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-[14px] leading-6 text-muted-foreground">这份快照没有服务说明。</p>;
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[14px] font-light leading-6 text-foreground">
      {blocks.map((block, index) => {
        const fenced = block.startsWith("```");
        if (fenced) {
          const code = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          return (
            <pre key={index} className="overflow-auto rounded-lg bg-muted p-3 text-[12px] leading-5 text-foreground/80">
              {code}
            </pre>
          );
        }
        const heading = block.match(/^(#{1,3})\s+([\s\S]+)$/);
        if (heading && !block.includes("\n")) {
          return (
            <h3 key={index} className="text-[16px] font-semibold leading-7 text-foreground">
              {heading[2]}
            </h3>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {block.replace(/^#{1,3}\s+/gm, "")}
          </p>
        );
      })}
    </div>
  );
}

function ToolList({ tools }: { tools: McpMarketTool[] }) {
  if (tools.length === 0) return <p className="text-[14px] leading-6 text-muted-foreground">工具信息暂未提供</p>;
  return (
    <ul className="space-y-4">
      {tools.map((tool) => (
        <li key={tool.name} className="rounded-xl bg-muted px-[18px] py-[14px]">
          <h3 className="text-[16px] font-semibold leading-7 text-foreground">{tool.name}</h3>
          {tool.description ? <p className="mt-1 whitespace-pre-wrap text-[14px] font-light leading-6 text-foreground/80">{tool.description}</p> : null}
          {tool.params.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {tool.params.map((param) => (
                <li key={param.name} className="text-[13px] leading-5 text-foreground/80">
                  <span className="font-medium text-foreground">{param.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({param.type || "string"}
                    {param.required ? "，必填" : "，可选"})
                  </span>
                  {param.description ? <span>：{param.description}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function McpMarketDetailPage() {
  const params = useParams();
  const id = params.id ?? "";
  const [item, setItem] = useState<McpMarketDetail | null>(null);
  const [tab, setTab] = useState<"readme" | "tools">("readme");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setError("");
    setTab("readme");
    getMcpMarket(id)
      .then((body) => {
        if (!gone) setItem(body);
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取服务详情失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [id]);

  const initial = item?.name.trim().slice(0, 1) || "M";
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="服务详情" back={{ to: "/experts/connectors", label: "MCP 广场" }} />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <section aria-label="MCP 详情" className="mx-auto max-w-[920px]">
        {loading ? <p className="text-[14px] text-muted-foreground">正在读取服务详情。</p> : null}
        {error ? <Alert>{error}</Alert> : null}
        {item ? (
          <>
            <div className="flex items-start gap-4">
              <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-muted text-[22px] font-semibold text-primary">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[18px] font-semibold leading-6 text-foreground">{item.name}</h1>
                  <span className={`inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium ${item.hosted ? "text-primary" : "text-success"}`}>
                    {item.hosted ? "Hosted" : "Local"}
                  </span>
                  {item.updatedOn ? <span className="text-[12px] leading-4 text-muted-foreground">{item.updatedOn}</span> : null}
                </div>
                <p className="mt-2 flex flex-wrap gap-3 text-[12px] leading-4 text-muted-foreground">
                  {item.hosted && item.calls > 0 ? <span title="托管服务调用次数">{formatStat(item.calls)}</span> : null}
                  {item.views > 0 ? <span title="浏览">{formatStat(item.views)}</span> : null}
                  {item.stars > 0 ? <span title="收藏">{formatStat(item.stars)}</span> : null}
                  <span>{item.needsOnline ? "需要联网" : "可离线使用"}</span>
                </p>
                <p className="mt-2 text-[12px] leading-4 text-muted-foreground">{item.author}</p>
              </div>
            </div>
            <p className="mt-4 text-[14px] font-light leading-6 text-foreground/80">{item.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] leading-5 text-foreground/80">
              {item.categoryName ? <span className="rounded bg-muted px-[5px]">{item.categoryName}</span> : null}
              {item.license ? <span>许可证：{item.license}</span> : null}
              {item.author ? <span>开发者：{item.author}</span> : null}
            </div>
            <div className="mt-6 flex gap-6 border-b border-border" role="tablist" aria-label="服务内容">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "readme"}
                className={`border-b-2 pb-2 text-[14px] font-medium ${tab === "readme" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => setTab("readme")}
              >
                服务详情
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "tools"}
                className={`border-b-2 pb-2 text-[14px] font-medium ${tab === "tools" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => setTab("tools")}
              >
                工具
              </button>
            </div>
            <div className="mt-5" role="tabpanel">
              {tab === "readme" ? <ReadmeBody text={item.readme} /> : <ToolList tools={item.tools} />}
            </div>
            <aside className="mt-8 rounded-xl bg-muted px-[18px] py-[14px] text-[13px] leading-6 text-foreground/80">
              <h2 className="text-[14px] font-medium text-foreground">服务配置</h2>
              {item.hosted ? (
                <p className="mt-1">托管服务的连接地址按账号发放，属于敏感信息。这里不保存，也不在这里连接。</p>
              ) : (
                <p className="mt-1">这是本地服务。说明里的启动方式只作阅读，页面不会执行，也不会保存密钥。</p>
              )}
            </aside>
          </>
        ) : null}
      </section>
      </div>
    </div>
  );
}
