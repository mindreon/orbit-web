import { useState } from "react";
import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { toast } from "../../platform/toast/store";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field, Input, Select } from "../../ui/fields";
import { createKey, createService, revokeKey, useAdminList } from "./api";
import { tenantRoleLabels } from "./labels";
import { dateTime, DestructiveAction, FormDialog, LoadMore, More, QueryState, useAdminWrite } from "./shared";
export function OneTimeSecret({ secret, onClose }: { secret: string; onClose(): void }) {
  return <Dialog title="保存 API Key" onClose={onClose} dismissible={false}><div className="space-y-4"><code className="block break-all rounded-control bg-muted p-3 text-small">{secret}</code><Button onClick={() => void navigator.clipboard.writeText(secret).then(() => toast.success("已复制"), () => toast.error("复制失败，请手动复制"))}>复制密钥</Button><p className="rounded-control bg-warning-50 p-3 text-small text-warning-700">关闭后无法再次查看</p><div className="flex justify-end"><Button variant="primary" onClick={onClose}>我已保存</Button></div></div></Dialog>;
}
export function APIKeys() {
  const query = useAdminList<S["APIKey"]>("api-keys", "/admin/api-keys"); const [creating, setCreating] = useState(false); const [secret, setSecret] = useState<string>(); const [revoking, setRevoking] = useState<S["APIKey"]>();
  return <div className="space-y-4"><div className="flex justify-end"><Button variant="primary" onClick={() => setCreating(true)}>创建 API Key</Button></div><QueryState query={query}><DataTable name="API Key" headers={["名称", "前缀", "作用域", "过期", "最近使用", "操作"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{item.name}</td><td className="font-mono">{item.prefix}</td><td className="font-mono">{(item.scopes ?? []).join("、")}</td><td>{dateTime(item.expires_at)}</td><td>{dateTime(item.last_used_at)}</td><td><More name={item.name} items={[{ label: "吊销", danger: true, onSelect: () => setRevoking(item) }]} /></td></tr>)}</DataTable><LoadMore query={query} /></QueryState>{creating ? <KeyDialog onClose={() => setCreating(false)} onCreated={(value) => { setCreating(false); setSecret(value); }} /> : null}{secret ? <OneTimeSecret secret={secret} onClose={() => setSecret(undefined)} /> : null}{revoking ? <DestructiveAction name={`吊销 API Key“${revoking.name}”`} resource="api-keys" action={(key) => revokeKey(revoking.id, key)} onClose={() => setRevoking(undefined)} /> : null}</div>;
}
function KeyDialog({ onClose, onCreated }: { onClose(): void; onCreated(secret: string): void }) {
  const [name, setName] = useState(""); const [scopes, setScopes] = useState(""); const [expires, setExpires] = useState(""); const [principal, setPrincipal] = useState("");
  const services = useAdminList<S["Principal"]>("service-principals", "/admin/service-principals");
  const body: S["APIKeyInput"] = { name, scopes: scopes.split(/[\s,]+/).filter(Boolean), expires_at: expires && !Number.isNaN(Date.parse(expires)) ? new Date(expires).toISOString() : "", ...(principal ? { principal_id: principal } : {}) };
  const write = useAdminWrite("api-keys", body);
  return <FormDialog title="创建 API Key" onClose={onClose} busy={write.busy} error={write.error} onSubmit={() => void write.run((key) => createKey(body, key), (value) => onCreated((value as S["APIKeyCreated"]).key))}><Field label="名称"><Input name="name" required value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="作用域（逗号分隔）"><Input name="scopes" required className="font-mono" value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="session.read, session.create" /></Field><Field label="过期时间"><Input name="expires_at" required type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field><Field label="服务账号"><Select name="principal_id" className="w-full" value={principal} onChange={(e) => setPrincipal(e.target.value)}><option value="">当前账号</option>{services.data?.pages.flatMap((page) => page.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</Select></Field><LoadMore query={services} /></FormDialog>;
}
export function ServiceAccounts() {
  const query = useAdminList<S["Principal"]>("service-principals", "/admin/service-principals"); const [creating, setCreating] = useState(false);
  return <div className="space-y-4"><div className="flex justify-end"><Button variant="primary" onClick={() => setCreating(true)}>创建服务账号</Button></div><QueryState query={query}><DataTable name="服务账号" headers={["显示名", "账号 ID"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{item.display_name}</td><td className="font-mono">{item.id}</td></tr>)}</DataTable><LoadMore query={query} /></QueryState>{creating ? <ServiceDialog onClose={() => setCreating(false)} /> : null}</div>;
}
function ServiceDialog({ onClose }: { onClose(): void }) {
  const [displayName, setDisplayName] = useState(""); const [role, setRole] = useState<S["TenantRole"]>("tenant.member");
  const body = { display_name: displayName, role }; const write = useAdminWrite("service-principals", body);
  return <FormDialog title="创建服务账号" onClose={onClose} busy={write.busy} error={write.error} onSubmit={() => void write.run((key) => createService(body, key), onClose)}><Field label="显示名"><Input name="display_name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field><Field label="角色"><Select name="role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{Object.entries(tenantRoleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field></FormDialog>;
}
