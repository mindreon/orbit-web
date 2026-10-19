import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { useAdminList, type ModelMetadata, type QuotaMetadata, type SecretMetadata } from "./api";
import { dateTime, LoadMore, QueryState } from "./shared";
export function Audit() {
  const query = useAdminList<S["AuditEntry"]>("audit", "/admin/audit");
  return <QueryState query={query}><DataTable name="审计" headers={["时间", "操作者", "操作", "目标类型", "目标", "明细"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{dateTime(item.occurred_at)}</td><td className="font-mono">{item.actor_id}</td><td className="font-mono">{item.action}</td><td className="font-mono">{item.target_type}</td><td className="font-mono">{item.target_id}</td><td><details><summary className="cursor-pointer">查看</summary><pre className="max-w-reading whitespace-pre-wrap break-all p-2 text-caption">{JSON.stringify(item.detail, null, 2)}</pre></details></td></tr>)}</DataTable><LoadMore query={query} /></QueryState>;
}
export function ReadOnly({ kind }: { kind: "models" | "secrets" | "quotas" }) {
  return <div className="space-y-4"><p className="rounded-control bg-gray-100 px-3 py-2 text-small text-gray-700">只读。修改请使用 <code>orbit-admin</code>。</p>{kind === "models" ? <Models /> : kind === "secrets" ? <Secrets /> : <Quotas />}</div>;
}
function Models() {
  const query = useAdminList<ModelMetadata>("models", "/admin/models");
  return <QueryState query={query}><DataTable name="模型" headers={["配置档名称", "提供方", "模型名", "默认"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{item.name}</td><td className="font-mono">{item.provider}</td><td className="font-mono">{item.model}</td><td>{item.is_default ? "是" : "否"}</td></tr>)}</DataTable><LoadMore query={query} /></QueryState>;
}
function Secrets() {
  const query = useAdminList<SecretMetadata>("secrets", "/admin/secrets");
  return <QueryState query={query}><DataTable name="密钥" headers={["名称", "作用域", "创建时间"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{item.name}</td><td className="font-mono">{item.scope}</td><td>{dateTime(item.created_at)}</td></tr>)}</DataTable><LoadMore query={query} /></QueryState>;
}
function Quotas() {
  const query = useAdminList<QuotaMetadata>("quotas", "/admin/quotas");
  return <QueryState query={query}><DataTable name="额度" headers={["范围", "范围 ID", "计量项", "上限", "周期", "动作"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td className="font-mono">{item.scope_type}</td><td className="font-mono">{item.scope_id}</td><td className="font-mono">{item.metric}</td><td className="tabular-nums">{item.limit}</td><td className="font-mono">{item.period}</td><td className="font-mono">{item.action}</td></tr>)}</DataTable><LoadMore query={query} /></QueryState>;
}
