import { canNavigate } from "../platform/permissions";
import { useWorkspace } from "../platform/tenancy/WorkspaceProvider";
import { Select } from "../ui/Select";
import { Link } from "react-router";
import { LogOut, Menu, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { BREAKPOINT, useMediaQuery } from "../platform/useMediaQuery";
import { useIdentity } from "../platform/identity";
import { ErrorBoundary } from "./ErrorBoundary";
import { RecentSessions } from "../features/sessions";

const NAV = [
  { group: "", items: [
    { to: "/experts", label: "专家", permission: "catalog" },
    { to: "/expert-teams", label: "专家团", permission: "catalog" },
    { to: "/inbox", label: "收件箱", permission: "inbox" },
  ] },
  { group: "资源", items: [
    { to: "/assets", label: "资产中心", permission: "assets" },
    { to: "/reviews", label: "审核", permission: "reviews" },
    { to: "/schedules", label: "定时任务", permission: "schedules" },
    { to: "/usage", label: "用量" },
  ] },
  { group: "系统", items: [
    { to: "/admin/workspaces", label: "管理", permission: "admin" },
    { to: "/admin/audit", label: "审计", permission: "audit" },
  ] },
] as const;

function Sidebar() {
  const { principal, roles, signOut } = useIdentity();
  const workspace = useWorkspace();
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex h-12 shrink-0 items-center gap-2 px-5">
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-control bg-primary text-caption font-semibold text-primary-foreground">O</span>
        <span className="text-title font-semibold tracking-tight">Orbit</span>
      </div>
      <div className="space-y-3 px-3 pb-4 pt-1">
        <Select label="工作空间" value={workspace.current?.id ?? ""} disabled={!workspace.workspaces.length} onValueChange={workspace.select} options={workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))} />
        <Link to="/sessions?new=" className="flex h-9 items-center justify-center gap-1.5 rounded-control bg-primary px-3 text-body font-medium text-primary-foreground hover:bg-primary-hover"><Plus aria-hidden="true" className="h-4 w-4" />新建会话</Link>
      </div>
      <nav aria-label="主导航" className="space-y-4 px-2 pb-4">
        {NAV.map(({ group, items }) => {
          const visible = items.filter((item) => !("permission" in item) || canNavigate(roles, item.permission));
          if (!visible.length) return null;
          return (
            <div key={group || "main"} className="space-y-0.5">
              {group ? <p className="px-3 pb-1 text-small font-medium text-muted-foreground">{group}</p> : null}
              {visible.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => cn("flex h-8 items-center gap-2 rounded-control px-3 text-body", isActive ? "bg-gray-200 font-medium text-foreground" : "text-gray-700 hover:bg-gray-100")}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="flex-1">
        <RecentSessions />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Link to="/me" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-body hover:bg-gray-100"><UserRound aria-hidden="true" className="h-4 w-4" />我<span className="truncate text-caption text-muted-foreground">{principal?.display_name || principal?.email}</span></Link>
        <button type="button" aria-label="退出登录" title="退出登录" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => void signOut()}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** The signed-in frame: sidebar (a drawer on phones) around the page. */
export function AppLayout() {
  const wide = useMediaQuery(BREAKPOINT.sm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  // Going to a page from the drawer closes it.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const open = !wide && drawerOpen;
  return (
    <div className="flex h-screen bg-background text-foreground">
      {open ? <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40" onClick={() => setDrawerOpen(false)} /> : null}
      {wide || open ? (
        <aside className={cn("w-60 shrink-0 border-r border-border bg-gray-50 text-foreground", !wide && "fixed inset-y-0 left-0 z-40 w-60 max-w-full")}>
          <Sidebar />
        </aside>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {wide ? null : (
          <div className="flex h-12 shrink-0 items-center gap-2 bg-sidebar px-3">
            <button type="button" aria-label="打开导航" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => setDrawerOpen(true)}>
              <Menu aria-hidden="true" className="h-4 w-4" />
            </button>
            <span className="text-title font-semibold text-foreground">Orbit</span>
          </div>
        )}
        <ErrorBoundary resetKey={pathname}>
          <div key={pathname} className="page-enter flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}
