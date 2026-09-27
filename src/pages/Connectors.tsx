import { useEffect, useState } from "react";
import { createMcpConnector, describeRoomFailure, listMcpConnectors, type McpConnector, type McpHeaderRef } from "../lib/rooms";
import { McpMarketCatalog } from "./McpMarkets";

function splitList(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHeaderRefs(value: string): McpHeaderRef[] | null {
  const refs: McpHeaderRef[] = [];
  for (const item of splitList(value)) {
    const colon = item.indexOf(":");
    if (colon <= 0) return null;
    const name = item.slice(0, colon).trim();
    const env = item.slice(colon + 1).trim();
    if (!name || !env || env.includes("=") || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(env)) return null;
    refs.push({ name, env });
  }
  return refs;
}

export function ConnectorsPage() {
  const [items, setItems] = useState<McpConnector[]>([]);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "streamable_http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envRefs, setEnvRefs] = useState("");
  const [url, setUrl] = useState("");
  const [headerRefs, setHeaderRefs] = useState("");
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  async function reload() {
    const body = await listMcpConnectors();
    setItems(body.items ?? []);
  }

  useEffect(() => {
    let gone = false;
    listMcpConnectors()
      .then((body) => {
        if (!gone) setItems(body.items ?? []);
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeRoomFailure("读取连接器失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f8] px-6 py-8">
      <h1 className="text-lg font-medium">连接器</h1>
      <p className="mt-1 max-w-xl text-sm text-[#666]">
        登记一个 MCP 连接器。本地命令由任务在运行时启动，远程地址由任务在运行时连接。这个页面只保存名字和连接方式，不会在这里运行，也不填写密钥。
      </p>
      <form
        className="mt-5 max-w-xl rounded-xl border border-[#ececee] bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          const nextCommand = command.trim();
          const nextUrl = url.trim();
          if (!nextName || (transport === "stdio" ? !nextCommand : !nextUrl)) {
            setFormError(transport === "stdio" ? "请填写名称和启动命令" : "请填写名称和远程地址");
            return;
          }
          if (envRefs.includes("=")) {
            setFormError("环境变量只填名字，不要填写密钥");
            return;
          }
          const parsedHeaders = parseHeaderRefs(headerRefs);
          if (parsedHeaders === null) {
            setFormError("请求头只填头名字和环境变量名，不要填写密钥");
            return;
          }
          setFormError("");
          setSaving(true);
          setError("");
          createMcpConnector({
            name: nextName,
            transport,
            command: transport === "stdio" ? nextCommand : "",
            args: transport === "stdio" ? splitList(args) : [],
            envRefs: splitList(envRefs),
            url: transport === "streamable_http" ? nextUrl : "",
            headerRefs: parsedHeaders,
            defaultOpen,
          })
            .then(() => reload())
            .then(() => {
              setName("");
              setCommand("");
              setArgs("");
              setEnvRefs("");
              setUrl("");
              setHeaderRefs("");
              setDefaultOpen(false);
            })
            .catch((err: unknown) => setError(describeRoomFailure("添加连接器失败", err)))
            .finally(() => setSaving(false));
        }}
      >
        <label className="block text-sm">
          名称
          <input
            aria-label="连接器名称"
            value={name}
            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset className="mt-3">
          <legend className="text-sm">连接方式</legend>
          <label className="mt-1 mr-4 inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="transport"
              value="stdio"
              checked={transport === "stdio"}
              onChange={() => setTransport("stdio")}
            />
            本地命令
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="transport"
              value="streamable_http"
              checked={transport === "streamable_http"}
              onChange={() => setTransport("streamable_http")}
            />
            远程地址
          </label>
        </fieldset>
        {transport === "stdio" ? (
          <>
            <label className="mt-3 block text-sm">
              启动命令
              <input
                aria-label="启动命令"
                value={command}
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
                onChange={(event) => setCommand(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              参数
              <input
                aria-label="启动参数"
                value={args}
                placeholder="用空格分开"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
                onChange={(event) => setArgs(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="mt-3 block text-sm">
              远程地址
              <input
                aria-label="远程 MCP 地址"
                value={url}
                placeholder="https://example.com/mcp"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              请求头
              <input
                aria-label="请求头"
                value={headerRefs}
                placeholder="Authorization:DOCS_TOKEN"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
                onChange={(event) => setHeaderRefs(event.target.value)}
              />
            </label>
            <p className="mt-1 text-xs text-[#888]">冒号左边是头名字，右边是环境变量名。不要填写密钥。</p>
          </>
        )}
        <label className="mt-3 block text-sm">
          环境变量名
          <input
            aria-label="环境变量名"
            value={envRefs}
            placeholder="例如 DOCS_TOKEN"
            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
            onChange={(event) => setEnvRefs(event.target.value)}
          />
        </label>
        <p className="mt-1 text-xs text-[#888]">只写变量名字。值放在运行任务的环境里，不要在这里填写密钥。</p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={defaultOpen} onChange={(event) => setDefaultOpen(event.target.checked)} />
          新建任务时默认连接
        </label>
        {formError ? <p className="mt-2 text-sm text-[#c04545]">{formError}</p> : null}
        <button type="submit" disabled={saving} className="mt-3 block rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? "正在保存" : "添加连接器"}
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-[#c04545]">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-[#888]">正在加载连接器</p> : null}
      {!loading && items.length === 0 ? <p className="mt-4 text-sm text-[#666]">还没有连接器。</p> : null}
      <ul className="mt-4 grid max-w-xl gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-[#ececee] bg-white p-4">
            <p className="text-sm font-medium">{item.name}</p>
            {item.transport === "streamable_http" ? (
              <p className="mt-1 text-sm text-[#666]">{item.url}</p>
            ) : (
              <p className="mt-1 text-sm text-[#666]">{item.command}</p>
            )}
            {item.envRefs && item.envRefs.length > 0 ? <p className="mt-1 text-xs text-[#888]">环境变量名：{item.envRefs.join("、")}</p> : null}
            {item.headerRefs && item.headerRefs.length > 0 ? (
              <p className="mt-1 text-xs text-[#888]">请求头：{item.headerRefs.map((ref) => `${ref.name}:${ref.env}`).join("、")}</p>
            ) : null}
            {item.defaultOpen ? <p className="mt-1 text-xs text-[#888]">新建任务时默认连接</p> : null}
          </li>
        ))}
      </ul>
      <McpMarketCatalog />
    </div>
  );
}
