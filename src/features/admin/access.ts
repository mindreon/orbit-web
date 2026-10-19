import { canNavigate } from "../../platform/permissions";
export const adminTabs = [["workspaces", "工作空间"], ["members", "成员"], ["api-keys", "API Key"], ["service-accounts", "服务账号"], ["models", "模型"], ["secrets", "密钥"], ["quotas", "额度"], ["audit", "审计"]] as const;
export function canOpenAdmin(roles: readonly string[], tab: string) {
  // Direct workspace resources are authorized by the server, not by unscoped /me roles (W6).
  if (tab === "workspace-detail") return true;
  if (tab === "workspaces") return canNavigate(roles, "admin") || canNavigate(roles, "workspaceCreate");
  return canNavigate(roles, tab === "audit" ? "audit" : "admin");
}
export function visibleAdminTabs(roles: readonly string[]) { return adminTabs.filter(([tab]) => canNavigate(roles, tab === "audit" ? "audit" : "admin")); }
