const CAPABILITIES = [
  { name: "对话任务", detail: "Room、历史消息、SSE", status: "可用" },
  { name: "运行策略", detail: "dsh / ACP、进程隔离、权限预设", status: "可用" },
  { name: "审批与审计", detail: "HITL 与执行轨迹", status: "可用" },
  { name: "Persona / Skill", detail: "版本、发布与执行快照", status: "待补齐" },
  { name: "企业工具 / MCP", detail: "审核目录与 Cordis 编译", status: "待补齐" },
  { name: "数据与知识", detail: "连接器、索引和数据权限", status: "待补齐" },
  { name: "成果物", detail: "文件、报告和来源追踪", status: "待补齐" },
  { name: "Cloud Agent", detail: "clone、执行、push 与 PR", status: "W2" },
] as const;

export default function SettingsPage() {
  return (
    <section aria-labelledby="settings-title">
      <div>
        <h1 id="settings-title" className="text-xl font-semibold">
          能力与治理
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          展示当前真实能力，尚未接通的模块不会伪装成可用入口。
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((item) => (
          <article key={item.name} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">{item.name}</h2>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  item.status === "可用"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {item.status}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">{item.detail}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">安全边界</p>
        <p className="mt-1 text-amber-800">
          浏览器只连接 orbit-control；dsh、Temporal、worker 和凭据明文都不会暴露到前端。
        </p>
      </div>
    </section>
  );
}
