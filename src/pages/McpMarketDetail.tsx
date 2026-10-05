import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { describeFailure } from "../lib/api";
import { Alert } from "../ui/Alert";
import { PageHeader } from "../ui/PageHeader";
import { getMcpMarket, mcpMarketIconPath, type McpMarketDetail, type McpMarketTool } from "../lib/catalog";
import { CatalogAvatar } from "../components/CatalogAvatar";

function formatStat(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// 快照按安全约定不含 URL，readme 里的徽章和链接已经失效。徽章行直接丢弃，
// 行内链接 [文字](残缺地址) 降级成纯文字，剩下的正文才值得展示。
function cleanReadmeBlock(block: string) {
  const lines = block
    .split("\n")
    .filter((line) => !/^\s*(\[!\[|!\[)/.test(line))
    .map((line) => line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
  return lines.join("\n").replace(/\n{2,}/g, "\n").trim();
}

function ReadmeBody({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-body leading-6 text-muted-foreground">这份快照没有服务说明。</p>;
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => (block.startsWith("```") ? block : cleanReadmeBlock(block)))
    .filter((block) => block.trim());
  return (
    <div className="space-y-3 text-body font-normal leading-6 text-foreground">
      {blocks.map((block, index) => {
        const fenced = block.startsWith("```");
        if (fenced) {
          const code = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          return (
            <pre key={index} className="overflow-auto rounded-control bg-muted p-3 text-caption leading-5 text-gray-700">
              {code}
            </pre>
          );
        }
        const heading = block.match(/^(#{1,3})\s+([\s\S]+)$/);
        if (heading && !block.includes("\n")) {
          return (
            <h3 key={index} className="text-title font-semibold leading-7 text-foreground">
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
  if (tools.length === 0) return <p className="text-body leading-6 text-muted-foreground">工具信息暂未提供</p>;
  return (
    <ul className="space-y-4">
      {tools.map((tool) => (
        <li key={tool.name} className="rounded-card bg-muted px-[18px] py-[14px]">
          <h3 className="text-title font-semibold leading-7 text-foreground">{tool.name}</h3>
          {tool.description ? <p className="mt-1 whitespace-pre-wrap text-body font-normal leading-6 text-gray-700">{tool.description}</p> : null}
          {tool.params.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {tool.params.map((param) => (
                <li key={param.name} className="text-small leading-5 text-gray-700">
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
      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
      <section aria-label="MCP 详情" className="mx-auto max-w-[920px]">
        {loading ? <p className="text-body text-muted-foreground">正在读取服务详情。</p> : null}
        {error ? <Alert>{error}</Alert> : null}
        {item ? (
          <>
            <div className="flex items-start gap-4">
              <CatalogAvatar src={mcpMarketIconPath(id)} fallback={initial} className="h-[60px] w-[60px] text-heading" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-heading font-semibold leading-6 text-foreground">{item.name}</h1>
                  <span className={`inline-flex h-5 items-center rounded-full bg-muted px-2 text-caption font-medium ${item.hosted ? "text-primary-700" : "text-success-700"}`}>
                    {item.hosted ? "Hosted" : "Local"}
                  </span>
                  {item.updatedOn ? <span className="text-caption leading-4 text-muted-foreground">{item.updatedOn}</span> : null}
                </div>
                <p className="mt-2 flex flex-wrap gap-3 text-caption leading-4 text-muted-foreground">
                  {item.hosted && item.calls > 0 ? <span title="托管服务调用次数">{formatStat(item.calls)}</span> : null}
                  {item.views > 0 ? <span title="浏览">{formatStat(item.views)}</span> : null}
                  {item.stars > 0 ? <span title="收藏">{formatStat(item.stars)}</span> : null}
                  <span>{item.needsOnline ? "需要联网" : "可离线使用"}</span>
                </p>
                <p className="mt-2 text-caption leading-4 text-muted-foreground">{item.author}</p>
              </div>
            </div>
            <p className="mt-4 text-body font-normal leading-6 text-gray-700">{item.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-caption leading-5 text-gray-700">
              {item.categoryName ? <span className="rounded-control bg-muted px-[5px]">{item.categoryName}</span> : null}
              {item.license ? <span>许可证：{item.license}</span> : null}
              {item.author ? <span>开发者：{item.author}</span> : null}
            </div>
            <div className="mt-6 flex gap-6 border-b border-border" role="tablist" aria-label="服务内容">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "readme"}
                className={`border-b-2 pb-2 text-body font-medium ${tab === "readme" ? "border-primary text-primary-700" : "border-transparent text-muted-foreground"}`}
                onClick={() => setTab("readme")}
              >
                服务详情
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "tools"}
                className={`border-b-2 pb-2 text-body font-medium ${tab === "tools" ? "border-primary text-primary-700" : "border-transparent text-muted-foreground"}`}
                onClick={() => setTab("tools")}
              >
                工具
              </button>
            </div>
            <div className="mt-5" role="tabpanel">
              {tab === "readme" ? <ReadmeBody text={item.readme} /> : <ToolList tools={item.tools} />}
            </div>
            <aside className="mt-8 rounded-card bg-muted px-[18px] py-[14px] text-small leading-6 text-gray-700">
              <h2 className="text-body font-medium text-foreground">服务配置</h2>
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
