import { useEffect, useState } from "react";
import { createMcpConnector, describeRoomFailure, listMcpConnectors, type McpConnector } from "../lib/rooms";

function splitList(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ConnectorsPage() {
  const [items, setItems] = useState<McpConnector[]>([]);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envRefs, setEnvRefs] = useState("");
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
      <p className="mt-1 max-w-xl text-sm text-[#666]">登记一个 MCP 连接器的启动命令。这里只保存名字和命令，不会在这个页面里运行它。</p>
      <form
        className="mt-5 max-w-xl rounded-xl border border-[#ececee] bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          const nextCommand = command.trim();
          if (!nextName || !nextCommand) {
            setFormError("请填写名称和启动命令");
            return;
          }
          if (envRefs.includes("=")) {
            setFormError("环境变量只填名字，不要填写密钥");
            return;
          }
          setFormError("");
          setSaving(true);
          setError("");
          createMcpConnector({
            name: nextName,
            command: nextCommand,
            args: splitList(args),
            envRefs: splitList(envRefs),
          })
            .then(() => reload())
            .then(() => {
              setName("");
              setCommand("");
              setArgs("");
              setEnvRefs("");
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
        <p className="mt-1 text-xs text-[#888]">只写变量名字。不要在这里填写密钥。</p>
        {formError ? <p className="mt-2 text-sm text-[#c04545]">{formError}</p> : null}
        <button type="submit" disabled={saving} className="mt-3 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white disabled:opacity-40">
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
            <p className="mt-1 text-sm text-[#666]">{item.command}</p>
            {item.envRefs && item.envRefs.length > 0 ? <p className="mt-1 text-xs text-[#888]">环境变量名：{item.envRefs.join("、")}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
