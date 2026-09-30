import { Plug, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { describeFailure } from "../lib/api";
import { listMcpConnectors, type McpConnector } from "../lib/catalog";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PageBody, PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { SegmentedTabs } from "../ui/Tabs";
import { McpMarketCatalog } from "./McpMarkets";

const TABS = [
  { id: "mine", label: "我的连接器" },
  { id: "market", label: "MCP 广场" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function ConnectorCard({ item }: { item: McpConnector }) {
  const http = item.transport === "streamable_http";
  const target = http ? item.url : `${item.command ?? ""}${item.args && item.args.length > 0 ? ` ${item.args.join(" ")}` : ""}`;
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Plug aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground">{http ? "Streamable HTTP" : "Stdio"}</p>
        </div>
        {item.defaultOpen ? <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">新任务默认连接</span> : null}
      </div>
      <p className="mt-3 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground/80">{target}</p>
      {item.envRefs && item.envRefs.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">环境变量名：{item.envRefs.join("、")}</p> : null}
      {item.headerRefs && item.headerRefs.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">请求头：{item.headerRefs.map((ref) => `${ref.name}:${ref.env}`).join("、")}</p>
      ) : null}
    </li>
  );
}

function MyConnectors({ onBrowse }: { onBrowse: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    listMcpConnectors()
      .then((body) => {
        if (!gone) setItems(body.items ?? []);
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取连接器失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  if (!loading && !error && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 bg-muted">
        <EmptyState
          icon={Plug}
          title="还没有连接器"
          description="连接器只保存名字和连接方式，本地命令和远程地址由任务在运行时启动或连接。这里不运行，也不填写密钥。"
          actions={
            <>
              <Button variant="primary" onClick={() => navigate("/experts/connectors/new")}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                新建连接器
              </Button>
              <Button onClick={onBrowse}>去 MCP 广场看看</Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <PageBody>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ConnectorCard key={item.id} item={item} />
        ))}
      </ul>
    </PageBody>
  );
}

export function ConnectorsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "market" ? "market" : "mine";
  const select = (next: Tab) => setParams(next === "mine" ? {} : { tab: next }, { replace: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader
        title="连接器"
        description="登记 MCP 连接器，任务运行时按需连接"
        actions={
          <Button variant="primary" onClick={() => navigate("/experts/connectors/new")}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            新建连接器
          </Button>
        }
      />
      <div className="flex h-12 shrink-0 items-center border-b border-border bg-card px-6">
        <SegmentedTabs label="连接器" value={tab} options={TABS} onChange={select} />
      </div>
      {tab === "market" ? <McpMarketCatalog /> : <MyConnectors onBrowse={() => select("market")} />}
    </div>
  );
}
