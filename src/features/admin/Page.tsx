import { NavLink } from "react-router";
import { useIdentity } from "../../platform/identity";
import { Alert } from "../../ui/Alert";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { canOpenAdmin, visibleAdminTabs } from "./access";
import { APIKeys, ServiceAccounts } from "./APIKeys";
import { Members } from "./Members";
import { Audit, ReadOnly } from "./Metadata";
import { Usage } from "./Usage";
import { WorkspaceDetail, Workspaces } from "./Workspaces";
export default function Page({ tab }: { tab: string }) {
  const { roles } = useIdentity(); const usage = tab === "usage"; const allowed = usage || canOpenAdmin(roles, tab);
  return <><PageHeader title={usage ? "用量" : "管理"} />{!usage ? <nav aria-label="管理页签" className="flex shrink-0 gap-5 overflow-x-auto border-b border-border bg-muted px-4 sm:px-6">{visibleAdminTabs(roles).map(([key, label]) => <NavLink key={key} to={`/admin/${key}`} className={({ isActive }) => `whitespace-nowrap py-3 text-small ${isActive ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>{label}</NavLink>)}</nav> : null}<PageBody>{!allowed ? <Alert>没有权限查看此页面</Alert> : usage ? <Usage /> : tab === "members" ? <Members /> : tab === "api-keys" ? <APIKeys /> : tab === "service-accounts" ? <ServiceAccounts /> : tab === "audit" ? <Audit /> : tab === "workspace-detail" ? <WorkspaceDetail /> : tab === "workspaces" ? <Workspaces /> : tab === "models" || tab === "secrets" || tab === "quotas" ? <ReadOnly kind={tab} /> : null}</PageBody></>;
}
