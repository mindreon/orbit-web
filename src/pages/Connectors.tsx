import { Plug, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { describeFailure } from "../lib/api";
import { listMcpConnectors, type McpConnector } from "../lib/catalog";
import { CatalogHeader } from "../shell/CatalogHeader";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { HeadingTabs } from "../ui/Tabs";
import { McpMarketCatalog } from "./McpMarkets";

const TABS = [
  { id: "market", label: "MCP 广场" },
  { id: "mine", label: "我的连接器" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function ConnectorCard({ item }: { item: McpConnector }) {
  const http = item.transport === "streamable_http";
  const target = http ? item.url : `${item.command ?? ""}${item.args && item.args.length > 0 ? ` ${item.args.join(" ")}` : ""}`;
  return (
    <li className="rounded-card bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
          <Plug aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-foreground">{item.name}</p>
          <p className="text-caption text-muted-foreground">{http ? "Streamable HTTP" : "Stdio"}</p>
        </div>
        {item.defaultOpen ? <span className="shrink-0 rounded-control bg-accent px-1.5 py-0.5 text-caption text-accent-foreground">新任务默认连接</span> : null}
      </div>
      <p className="mt-3 break-all rounded-control bg-muted px-3 py-2 font-mono text-caption text-gray-700">{target}</p>
      {item.envRefs && item.envRefs.length > 0 ? <p className="mt-2 text-caption text-muted-foreground">环境变量名：{item.envRefs.join("、")}</p> : null}
      {item.headerRefs && item.headerRefs.length > 0 ? (
        <p className="mt-1 text-caption text-muted-foreground">请求头：{item.headerRefs.map((ref) => `${ref.name}:${ref.env}`).join("、")}</p>
      ) : null}
    </li>
  );
}

function MyConnectors({ keyword, onBrowse }: { keyword: string; onBrowse: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    listMcpConnectors()
      .then((body) => !gone && setItems(body.items ?? []))
      .catch((err: unknown) => !gone && setError(describeFailure("读取连接器失败", err)))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [items, keyword]);

  if (!loading && !error && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1">
        <EmptyState
          icon={Plug}
          title="还没有连接器"
          description="连接器只保存名字和连接方式，本地命令和远程地址由任务在运行时启动或连接。这里不运行，也不填写密钥。"
          actions={
            <>
              <Button variant="primary" onClick={() => navigate("/experts/connectors/new")}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                自定义连接器
              </Button>
              <Button onClick={onBrowse}>去 MCP 广场看看</Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {error ? <Alert>{error}</Alert> : null}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        ) : null}
        {!loading && shown.length === 0 && items.length > 0 ? <p className="text-body text-muted-foreground">没有匹配的连接器</p> : null}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
            <ConnectorCard key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ConnectorsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const tab: Tab = params.get("tab") === "mine" ? "mine" : "market";
  const select = (next: Tab) => setParams(next === "market" ? {} : { tab: next }, { replace: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <CatalogHeader title="连接器" search={{ value: keyword, onChange: setKeyword, placeholder: "搜索连接器" }}>
        <Button variant="primary" onClick={() => navigate("/experts/connectors/new")}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          自定义连接器
        </Button>
      </CatalogHeader>
      <div className="shrink-0 px-4 pt-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <HeadingTabs label="连接器" value={tab} options={TABS} onChange={select} />
        </div>
      </div>
      {tab === "market" ? <McpMarketCatalog keyword={keyword} /> : <MyConnectors keyword={keyword} onBrowse={() => select("market")} />}
    </div>
  );
}
