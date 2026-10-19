import type { S } from "../../api/types";
export const tenantRoleLabels = { "tenant.owner": "所有者", "tenant.admin": "管理员", "tenant.auditor": "审计员", "tenant.reviewer": "审核员", "tenant.member": "成员" } satisfies Record<S["TenantRole"], string>;
export const workspaceRoleLabels = { "ws.admin": "管理员", "ws.editor": "编辑者", "ws.member": "成员", "ws.viewer": "查看者" } satisfies Record<NonNullable<S["WorkspaceMemberInput"]["role"]>, string>;
export const memberStatusLabels = { active: "正常", invited: "未激活", suspended: "已停用" } satisfies Record<S["Member"]["status"], string>;
export const memberSourceLabels = { scim: "目录同步", invite: "历史导入", jit: "首次登录", direct: "直接加入" } satisfies Record<S["Member"]["source"], string>;
