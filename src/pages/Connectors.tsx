import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { describeFailure } from "../lib/api";
import { listMcpConnectors, type McpConnector } from "../lib/catalog";
import { McpMarketCatalog } from "./McpMarkets";

export function ConnectorsPage() {
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

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white px-6 py-8 text-foreground">
      <div className="flex max-w-[760px] items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold leading-6">连接器</h1>
          <p className="mt-1 text-[14px] font-light leading-6 text-foreground/80">
            已登记的连接器只保存名字和连接方式。本地命令由任务在运行时启动，远程地址由任务在运行时连接。这里不运行，也不填写密钥。
          </p>
        </div>
        <button
          type="button"
          className="h-9 shrink-0 rounded-lg bg-primary px-4 text-[14px] font-medium text-white"
          onClick={() => navigate("/experts/connectors/new")}
        >
          新建连接器
        </button>
      </div>
      {error ? <p className="mt-4 text-[14px] text-destructive">{error}</p> : null}
      {loading ? <p className="mt-4 text-[14px] text-muted-foreground">正在加载连接器</p> : null}
      {!loading && items.length === 0 ? <p className="mt-4 text-[14px] text-foreground/80">还没有连接器。</p> : null}
      <ul className="mt-4 grid max-w-[760px] gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl bg-muted px-[18px] py-[14px]">
            <p className="text-[16px] font-semibold leading-7">{item.name}</p>
            <p className="mt-1 text-[12px] leading-4 text-muted-foreground">{item.transport === "streamable_http" ? "Streamable HTTP" : "Stdio"}</p>
            {item.transport === "streamable_http" ? (
              <p className="mt-1 text-[14px] font-light leading-6 text-foreground/80">{item.url}</p>
            ) : (
              <p className="mt-1 text-[14px] font-light leading-6 text-foreground/80">
                {item.command}
                {item.args && item.args.length > 0 ? ` ${item.args.join(" ")}` : ""}
              </p>
            )}
            {item.envRefs && item.envRefs.length > 0 ? <p className="mt-1 text-[12px] leading-5 text-muted-foreground">环境变量名：{item.envRefs.join("、")}</p> : null}
            {item.headerRefs && item.headerRefs.length > 0 ? (
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">请求头：{item.headerRefs.map((ref) => `${ref.name}:${ref.env}`).join("、")}</p>
            ) : null}
            {item.defaultOpen ? <p className="mt-1 text-[12px] leading-5 text-muted-foreground">新建任务时默认连接</p> : null}
          </li>
        ))}
      </ul>
      <McpMarketCatalog />
    </div>
  );
}
