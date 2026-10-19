import { useState } from "react";
import type { S } from "../../api/types";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useIdentity } from "../../platform/identity";
import { Field, Input, Select } from "../../ui/fields";
import { saveMember, useAdminList } from "./api";
import { memberSourceLabels, memberStatusLabels, tenantRoleLabels } from "./labels";
import { DestructiveAction, FormDialog, LoadMore, More, QueryState, useAdminWrite } from "./shared";
export function Members() {
  const query = useAdminList<S["Member"]>("members", "/admin/members"); const [filter, setFilter] = useState(""); const [editing, setEditing] = useState<S["Member"]>(); const [changing, setChanging] = useState<S["Member"]>();
  const items = query.data?.pages.flatMap((page) => page.items ?? []).filter((member) => `${member.principal.email} ${member.principal.display_name}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? [];
  return <div className="space-y-4"><Input aria-label="按邮箱或显示名过滤" placeholder="按邮箱或显示名过滤" className="w-72 max-w-full" value={filter} onChange={(e) => setFilter(e.target.value)} /><QueryState query={query}><DataTable name="成员" headers={["成员", "状态", "来源", "角色", ""]}>{items.map((member) => <tr key={member.principal.id}><td className="max-w-80"><div className="truncate font-medium" title={member.principal.display_name}>{member.principal.display_name || member.principal.email}</div><div className="truncate text-caption text-muted-foreground" title={member.principal.email}>{member.principal.email}</div></td><td><StatusBadge status={member.status}>{memberStatusLabels[member.status]}</StatusBadge></td><td>{memberSourceLabels[member.source]}</td><td>{member.roles.map((role) => tenantRoleLabels[role as S["TenantRole"]] ?? role).join("、")}</td><td className="w-10 text-right"><More name={member.principal.email} items={[{ label: "改角色", onSelect: () => setEditing(member) }, { label: member.status === "suspended" ? "恢复" : "停用", danger: member.status !== "suspended", onSelect: () => setChanging(member) }]} /></td></tr>)}</DataTable>{!items.length ? <p className="text-small text-muted-foreground">没有匹配的成员，可加载更多后继续查找。</p> : null}<LoadMore query={query} /></QueryState>{editing ? <RoleDialog member={editing} onClose={() => setEditing(undefined)} /> : null}{changing ? <DestructiveAction name={`${changing.status === "suspended" ? "恢复" : "停用"}成员“${changing.principal.email}”`} resource="members" action={(key) => saveMember(changing.principal.id, { status: changing.status === "suspended" ? "active" : "suspended" }, key)} onClose={() => setChanging(undefined)} /> : null}</div>;
}
function RoleDialog({ member, onClose }: { member: S["Member"]; onClose(): void }) {
  const { roles } = useIdentity(); const currentRole = member.roles.find((value) => value in tenantRoleLabels) as S["TenantRole"] | undefined; const [role, setRole] = useState<S["TenantRole"]>(currentRole ?? "tenant.member");
  const write = useAdminWrite("members", { id: member.principal.id, role });
  const multipleRoles = member.roles.filter((value) => value in tenantRoleLabels).length > 1;
  const unchanged = !multipleRoles && role === currentRole;
  return <FormDialog title={`修改角色 · ${member.principal.display_name || member.principal.email}`} onClose={onClose} busy={write.busy} submitDisabled={unchanged} error={write.error} onSubmit={() => void write.run((key) => saveMember(member.principal.id, { role }, key), onClose)}><Field label="角色"><Select name="role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as S["TenantRole"])}>{Object.entries(tenantRoleLabels).filter(([key]) => key !== "tenant.owner" || roles.includes("tenant.owner") || role === key).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>{multipleRoles ? <p className="text-small text-warning-700">该成员当前有多个角色，保存后只保留所选角色</p> : null}</FormDialog>;
}
