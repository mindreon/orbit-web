import { useState } from "react";
import { Link, useParams } from "react-router";
import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { useEntries } from "../../platform/entries";
import { useIdentity } from "../../platform/identity";
import { canNavigate } from "../../platform/permissions";
import { Button } from "../../ui/Button";
import { Field, Input, Select } from "../../ui/fields";
import { addWorkspaceMember, createWorkspace, removeWorkspaceMember, saveWorkspace, useAdminList, useAdminWorkspace } from "./api";
import { workspaceRoleLabels } from "./labels";
import { dateTime, DestructiveAction, FormDialog, LoadMore, More, QueryState, useAdminWrite } from "./shared";
export function Workspaces() {
  const { authMode } = useIdentity();
  // iam 模式下工作空间 = baize 项目，orbit 不创建也不改名；列表照常。
  const managed = authMode !== "iam";
  const query = useAdminList<S["Workspace"]>("workspaces", "/workspaces"); const [editing, setEditing] = useState<S["Workspace"] | "new">();
  return <div className="space-y-4">{managed ? <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing("new")}>创建工作空间</Button></div> : null}<QueryState query={query}><DataTable name="工作空间" headers={managed ? ["名称", "默认专家", "创建时间", "操作"] : ["名称", "默认专家", "创建时间"]}>{query.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td><Link to={`/admin/workspaces/${item.id}`}>{item.name}</Link></td><td className="font-mono">{item.default_agent_ref ?? "—"}</td><td>{dateTime(item.created_at)}</td>{managed ? <td><More name={item.name} items={[{ label: "改名与默认专家", onSelect: () => setEditing(item) }]} /></td> : null}</tr>)}</DataTable><LoadMore query={query} /></QueryState>{managed && editing ? <WorkspaceDialog workspace={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} /> : null}</div>;
}
function WorkspaceDialog({ workspace, onClose }: { workspace?: S["Workspace"]; onClose(): void }) {
  const [name, setName] = useState(workspace?.name ?? ""); const [ref, setRef] = useState(workspace?.default_agent_ref ?? ""); const entries = useEntries();
  const body = { name, default_agent_ref: ref || null }; const write = useAdminWrite("workspaces", { id: workspace?.id, ...body });
  return <FormDialog title={workspace ? "编辑工作空间" : "创建工作空间"} onClose={onClose} busy={write.busy} error={write.error} onSubmit={() => void write.run((key) => workspace ? saveWorkspace(workspace.id, body, key) : createWorkspace(body, key), onClose)}><Field label="名称"><Input name="name" required value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="默认专家"><Select name="default_agent_ref" className="w-full" value={ref} onChange={(e) => setRef(e.target.value)}><option value="">不设置</option>{ref && !entries.data?.some((item) => `${item.publisher}/${item.name}` === ref) ? <option value={ref}>{ref}</option> : null}{entries.data?.filter((item) => item.kind === "agent").map((item) => <option key={item.id} value={`${item.publisher}/${item.name}`}>{item.publisher}/{item.name}</option>)}</Select></Field></FormDialog>;
}
export function WorkspaceDetail() {
  const { authMode } = useIdentity();
  // iam 模式下成员由 baize 项目决定，名单只进不出（记录的是打开过 orbit 的人），不展示也不增删；工作空间列表照常。
  const managed = authMode !== "iam";
  const { workspaceId = "" } = useParams(); const query = useAdminWorkspace(workspaceId); const members = useAdminList<S["Principal"]>(`workspace-members:${workspaceId}`, `/workspaces/${workspaceId}/members`, managed);
  const [adding, setAdding] = useState(false); const [removing, setRemoving] = useState<S["Principal"]>();
  return <div className="space-y-4"><QueryState query={query}><h2 className="text-title font-semibold">{query.data?.name}</h2><p className="text-small text-muted-foreground">默认专家 <code>{query.data?.default_agent_ref ?? "—"}</code></p></QueryState>{managed ? <><Button variant="primary" onClick={() => setAdding(true)}>添加工作空间成员</Button><QueryState query={members}><DataTable name="工作空间成员" headers={["显示名", "邮箱", "账号 ID", "操作"]}>{members.data?.pages.flatMap((page) => page.items ?? []).map((item) => <tr key={item.id}><td>{item.display_name}</td><td>{item.email}</td><td className="font-mono">{item.id}</td><td><More name={item.display_name || item.id} items={[{ label: "移除", danger: true, onSelect: () => setRemoving(item) }]} /></td></tr>)}</DataTable><p className="text-caption text-muted-foreground">成员接口未提供已有角色，添加时指定角色。</p><LoadMore query={members} /></QueryState></> : null}{managed && adding ? <WorkspaceMemberDialog id={workspaceId} onClose={() => setAdding(false)} /> : null}{managed && removing ? <DestructiveAction name={`移除“${removing.display_name || removing.id}”`} resource={`workspace-members:${workspaceId}`} action={(key) => removeWorkspaceMember(workspaceId, removing.id, key)} onClose={() => setRemoving(undefined)} /> : null}</div>;
}
function WorkspaceMemberDialog({ id, onClose }: { id: string; onClose(): void }) {
  const { roles } = useIdentity(); const memberRead = canNavigate(roles, "admin"); const members = useAdminList<S["Member"]>("members", "/admin/members", memberRead);
  const [principal, setPrincipal] = useState(""); const [role, setRole] = useState<NonNullable<S["WorkspaceMemberInput"]["role"]>>("ws.member");
  const body = { principal_id: principal, role }; const write = useAdminWrite(`workspace-members:${id}`, body);
  return <FormDialog title="添加工作空间成员" onClose={onClose} busy={write.busy} error={write.error} onSubmit={() => void write.run((key) => addWorkspaceMember(id, body, key), onClose)}><Field label="账号 ID">{memberRead && !members.error ? <Select name="principal_id" required className="w-full" value={principal} onChange={(e) => setPrincipal(e.target.value)}><option value="">选择成员</option>{members.data?.pages.flatMap((page) => page.items ?? []).filter((item) => item.status === "active").map((item) => <option key={item.principal.id} value={item.principal.id}>{item.principal.display_name} · {item.principal.email}</option>)}</Select> : <Input name="principal_id" required value={principal} onChange={(e) => setPrincipal(e.target.value)} />}</Field>{memberRead && !members.error ? <LoadMore query={members} /> : null}<Field label="角色"><Select name="role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{Object.entries(workspaceRoleLabels).map(([key, label]) => <option key={key} value={key}>{label} · {key}</option>)}</Select></Field></FormDialog>;
}
