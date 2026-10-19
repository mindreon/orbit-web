export type NavigationPermission = "catalog" | "inbox" | "assets" | "schedules" | "reviews" | "admin" | "audit" | "tenantUsage" | "workspaceCreate";
const elevated = ["tenant.owner", "tenant.admin"];
/** Navigation hints only. Resource authorization remains the server's responsibility. */
export function canNavigate(roles: readonly string[], permission: NavigationPermission): boolean {
  if (["catalog", "inbox", "assets", "schedules"].includes(permission)) return true;
  const allowed = permission === "reviews" ? [...elevated, "tenant.reviewer"] : permission === "audit" || permission === "tenantUsage" ? [...elevated, "tenant.auditor"] : permission === "workspaceCreate" ? [...elevated, "tenant.member"] : elevated;
  return roles.some((role) => allowed.includes(role));
}
