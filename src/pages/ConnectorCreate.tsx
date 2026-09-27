import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { createMcpConnector, describeRoomFailure, type McpHeaderRef } from "../lib/rooms";

type Transport = "stdio" | "streamable_http" | "sse";
type FillMode = "form" | "json";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const STDIO_PLACEHOLDER = `{
  "mcpServers": {
    "your_mcp_name": {
      "command": "",
      "args": ["string"],
      "env": {
        "KEY": ""
      }
    }
  }
}`;

const HTTP_PLACEHOLDER = `{
  "mcpServers": {
    "your_mcp_name": {
      "type": "streamable_http",
      "url": "https://example.com/mcp"
    }
  }
}`;

const SSE_PLACEHOLDER = `{
  "mcpServers": {
    "your_mcp_name": {
      "type": "sse",
      "url": "https://example.com/sse"
    }
  }
}`;

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
    if (!name || !env || env.includes("=") || !ENV_NAME.test(env)) return null;
    refs.push({ name, env });
  }
  return refs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// One mcpServers entry becomes one connector. Env values and header secrets
// are refused; only variable names are kept.
function parseServerConfig(raw: string, fallbackName: string): {
  name: string;
  transport: "stdio" | "streamable_http";
  command: string;
  args: string[];
  envRefs: string[];
  url: string;
  headerRefs: McpHeaderRef[];
} | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "请输入正确的json数据" };
  }
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1 || !isRecord(parsed[0])) return { error: "一次只添加一个 MCP 服务" };
    parsed = parsed[0];
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    return { error: "服务配置 JSON 结构不符合要求，请以 mcpServers 作为顶层字段。" };
  }
  const entries = Object.entries(parsed.mcpServers);
  if (entries.length !== 1) return { error: "一次只添加一个 MCP 服务" };
  const [key, server] = entries[0];
  if (!isRecord(server)) return { error: "请输入正确的json数据" };
  const declared = typeof server.type === "string" ? server.type : "";
  if (declared === "sse") return { error: "SSE 配置这里不保存。请改用 Streamable HTTP。" };
  const command = typeof server.command === "string" ? server.command.trim() : "";
  const url = typeof server.url === "string" ? server.url.trim() : "";
  const wantsHttp = declared === "streamable_http" || declared === "http" || (!command && Boolean(url));
  const transport = wantsHttp ? "streamable_http" : "stdio";
  if (transport === "stdio" && url) return { error: "请只填写一种服务配置" };
  if (transport === "streamable_http" && command) return { error: "请只填写一种服务配置" };

  const args: string[] = [];
  if (server.args != null) {
    if (!Array.isArray(server.args) || server.args.some((item) => typeof item !== "string")) {
      return { error: "请输入正确的json数据" };
    }
    for (const item of server.args) {
      const next = item.trim();
      if (next) args.push(next);
    }
  }

  const envRefs: string[] = [];
  if (server.env != null) {
    if (!isRecord(server.env)) return { error: "请输入正确的json数据" };
    for (const [envName, envValue] of Object.entries(server.env)) {
      if (!ENV_NAME.test(envName) || (envValue != null && envValue !== "")) {
        return { error: "环境变量只填名字，不要填写密钥" };
      }
      envRefs.push(envName);
    }
  }

  const headerRefs: McpHeaderRef[] = [];
  if (server.headers != null) {
    if (!isRecord(server.headers)) return { error: "请输入正确的json数据" };
    for (const [headerName, headerValue] of Object.entries(server.headers)) {
      if (headerValue == null || headerValue === "") continue;
      const matched = typeof headerValue === "string" ? headerValue.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/) : null;
      if (!matched) return { error: "请求头只填头名字和环境变量名，不要填写密钥" };
      headerRefs.push({ name: headerName, env: matched[1] });
    }
  }

  const name = fallbackName.trim() || key.trim();
  if (!name || (transport === "stdio" ? !command : !url)) {
    return { error: transport === "stdio" ? "请填写名称和启动命令" : "请填写名称和远程地址" };
  }
  return { name, transport, command, args, envRefs, url, headerRefs };
}

export function ConnectorCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [fillMode, setFillMode] = useState<FillMode>("form");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envRefs, setEnvRefs] = useState("");
  const [url, setUrl] = useState("");
  const [headerRefs, setHeaderRefs] = useState("");
  const [serverConfig, setServerConfig] = useState("");
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const placeholder = transport === "stdio" ? STDIO_PLACEHOLDER : transport === "sse" ? SSE_PLACEHOLDER : HTTP_PLACEHOLDER;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white px-6 py-8 text-[#27254C]">
      <nav className="mb-4 text-[12px] leading-4 text-[#8284A4]" aria-label="面包屑">
        <Link to="/experts/connectors" className="text-[#624AFF] no-underline">
          连接器
        </Link>
        <span className="mx-2">/</span>
        <span>自定义创建</span>
      </nav>
      <h1 className="text-[18px] font-semibold leading-6">自定义创建</h1>
      <p className="mt-1 max-w-[760px] text-[14px] font-light leading-6 text-[#464D5B]">
        登记一个 MCP 连接器。本地命令由任务在运行时启动，远程地址由任务在运行时连接。这个页面只保存名字和连接方式，不会在这里运行，也不填写密钥。
      </p>
      <form
        aria-label="自定义创建"
        className="mt-5 max-w-[760px] rounded-xl border border-[#ECEDF1] bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (transport === "sse") {
            setFormError("SSE 配置这里不保存。请改用 Streamable HTTP。");
            return;
          }
          const nextName = name.trim();
          let body: {
            name: string;
            transport: "stdio" | "streamable_http";
            command: string;
            args: string[];
            envRefs: string[];
            url: string;
            headerRefs: McpHeaderRef[];
          };
          if (fillMode === "json") {
            const parsed = parseServerConfig(serverConfig, nextName);
            if ("error" in parsed) {
              setFormError(parsed.error);
              return;
            }
            body = parsed;
          } else {
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
            body = {
              name: nextName,
              transport,
              command: transport === "stdio" ? nextCommand : "",
              args: transport === "stdio" ? splitList(args) : [],
              envRefs: splitList(envRefs),
              url: transport === "streamable_http" ? nextUrl : "",
              headerRefs: parsedHeaders,
            };
          }
          setFormError("");
          setSaving(true);
          setError("");
          createMcpConnector({ ...body, defaultOpen })
            .then(() => navigate("/experts/connectors"))
            .catch((err: unknown) => setError(describeRoomFailure("添加连接器失败", err)))
            .finally(() => setSaving(false));
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold leading-6">服务配置</h2>
            <p className="mt-1 text-[12px] leading-5 text-[#8284A4]">服务配置支持 Stdio 和 Streamable HTTP。环境变量只写名字，值留空。</p>
          </div>
          <div className="inline-flex rounded-lg bg-[#F7F9FD] p-1" role="tablist" aria-label="填写方式">
            {(
              [
                ["form", "表单"],
                ["json", "JSON"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={fillMode === value}
                className={`h-8 rounded-md px-3 text-[13px] font-medium ${fillMode === value ? "bg-white text-[#624AFF] shadow-sm" : "text-[#8284A4]"}`}
                onClick={() => {
                  setFillMode(value);
                  setFormError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-[14px] font-medium">服务配置</legend>
          <div className="mt-2 inline-flex rounded-lg bg-[#F7F9FD] p-1">
            {(
              [
                ["stdio", "Stdio"],
                ["streamable_http", "Streamable HTTP"],
                ["sse", "SSE"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-[13px] font-medium ${transport === value ? "bg-white text-[#624AFF] shadow-sm" : "text-[#8284A4]"}`}
              >
                <input
                  type="radio"
                  name="transport"
                  value={value}
                  checked={transport === value}
                  className="sr-only"
                  onChange={() => {
                    setTransport(value);
                    setFormError("");
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {transport === "sse" ? (
          <p className="mt-4 text-[14px] leading-6 text-[#464D5B]">SSE 配置这里不保存。请改用 Streamable HTTP。</p>
        ) : fillMode === "json" ? (
          <label className="mt-4 block text-[14px]">
            服务配置
            <textarea
              aria-label="服务配置 JSON"
              value={serverConfig}
              placeholder={placeholder}
              spellCheck={false}
              className="mt-2 h-56 w-full resize-none rounded-lg border border-[#ECEDF1] bg-[#F7F9FD] p-3 font-mono text-[12px] leading-5 text-[#27254C] outline-none"
              onChange={(event) => setServerConfig(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label className="mt-4 block text-[14px]">
              名称
              <input
                aria-label="连接器名称"
                value={name}
                placeholder="MCP Server 名称，如 fetch、time 等"
                className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {transport === "stdio" ? (
              <>
                <label className="mt-3 block text-[14px]">
                  启动命令
                  <input
                    aria-label="启动命令"
                    value={command}
                    className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                    onChange={(event) => setCommand(event.target.value)}
                  />
                </label>
                <label className="mt-3 block text-[14px]">
                  参数
                  <input
                    aria-label="启动参数"
                    value={args}
                    placeholder="用空格分开"
                    className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                    onChange={(event) => setArgs(event.target.value)}
                  />
                </label>
                <label className="mt-3 block text-[14px]">
                  环境变量配置
                  <input
                    aria-label="环境变量名"
                    value={envRefs}
                    placeholder="例如 DOCS_TOKEN"
                    className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                    onChange={(event) => setEnvRefs(event.target.value)}
                  />
                </label>
                <p className="mt-1 text-[12px] leading-5 text-[#8284A4]">只写变量名字。值放在运行任务的环境里，不要在这里填写密钥。</p>
              </>
            ) : (
              <>
                <label className="mt-3 block text-[14px]">
                  URL 链接
                  <input
                    aria-label="远程 MCP 地址"
                    value={url}
                    placeholder="MCP Server StreamableHTTP 链接"
                    className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </label>
                <label className="mt-3 block text-[14px]">
                  参数配置
                  <input
                    aria-label="请求头"
                    value={headerRefs}
                    placeholder="Authorization:DOCS_TOKEN"
                    className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
                    onChange={(event) => setHeaderRefs(event.target.value)}
                  />
                </label>
                <p className="mt-1 text-[12px] leading-5 text-[#8284A4]">冒号左边是头名字，右边是环境变量名。不要填写密钥。</p>
              </>
            )}
          </>
        )}
        {transport !== "sse" && fillMode === "json" ? (
          <label className="mt-3 block text-[14px]">
            名称
            <input
              aria-label="连接器名称"
              value={name}
              placeholder="留空时使用 JSON 里的服务名"
              className="mt-1 h-9 w-full rounded-lg border border-[#ECEDF1] px-3 text-[14px] outline-none"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        ) : null}
        <label className="mt-4 inline-flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={defaultOpen} onChange={(event) => setDefaultOpen(event.target.checked)} />
          新建任务时默认连接
        </label>
        {formError ? <p className="mt-2 text-[14px] text-[#c04545]">{formError}</p> : null}
        <button type="submit" disabled={saving} className="mt-4 block h-9 rounded-lg bg-[#624AFF] px-4 text-[14px] font-medium text-white disabled:opacity-40">
          {saving ? "正在保存" : "添加连接器"}
        </button>
      </form>
      {error ? <p className="mt-4 text-[14px] text-[#c04545]">{error}</p> : null}
    </div>
  );
}
