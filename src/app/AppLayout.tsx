import { useQueryClient } from "@tanstack/react-query";
import { canNavigate } from "../platform/permissions";
import { useWorkspace } from "../platform/tenancy/WorkspaceProvider";
import { Select } from "../ui/Select";
import { Link } from "react-router";
import { BarChart3, Bot, Clock, Inbox, Library, LogOut, PanelLeftClose, PanelLeftOpen, Plug, ScrollText, Search, Settings, ShieldCheck, Sparkles, SquarePen, UserRound, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { describeFailure } from "../api/errors";
import { cn } from "../lib/cn";
import { api } from "../platform/client";
import { qk } from "../platform/queryKeys";
import { BREAKPOINT, useMediaQuery } from "../platform/useMediaQuery";
import { useIdempotencyIntent } from "../platform/useIdempotencyIntent";
import { useIdentity } from "../platform/identity";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Input } from "../ui/fields";
import { ErrorBoundary } from "./ErrorBoundary";
import { RecentSessions } from "../features/sessions";

const ITEM = "flex h-9 items-center gap-2.5 rounded-control px-3 text-body";
const ACTIVE = "bg-sidebar-accent font-medium text-primary-700 hover:bg-sidebar-accent";
const REAL = "font-medium text-gray-800 hover:bg-gray-200";

const NAV = [
  { group: "", items: [
    { to: "/experts", label: "专家", permission: "catalog", icon: Bot },
    { to: "/expert-teams", label: "专家团", permission: "catalog", icon: Users },
    { to: "/skills", label: "技能", permission: "catalog", icon: Sparkles },
    { to: "/mcp", label: "MCP", permission: "catalog", icon: Plug },
    { to: "/inbox", label: "收件箱", permission: "inbox", icon: Inbox },
  ] },
  { group: "资源", items: [
    { to: "/assets", label: "资产中心", permission: "assets", icon: Library },
    { to: "/reviews", label: "审核", permission: "reviews", icon: ShieldCheck },
    { to: "/schedules", label: "定时任务", permission: "schedules", icon: Clock },
    { to: "/usage", label: "用量", icon: BarChart3 },
  ] },
  { group: "系统", items: [
    { to: "/admin/workspaces", label: "管理", permission: "admin", icon: Settings },
    { to: "/admin/audit", label: "审计", permission: "audit", icon: ScrollText },
  ] },
] as const;

function WorkspacePicker() {
  const { roles, currentTenant } = useIdentity();
  const workspace = useWorkspace();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const intent = useIdempotencyIntent(name);
  const canCreate = canNavigate(roles, "workspaceCreate");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.post("/workspaces", { name: name.trim() }, { idempotencyKey: intent.key });
      intent.succeeded();
      await client.invalidateQueries({ queryKey: qk.workspaces(currentTenant?.id ?? null) });
      setCreating(false);
      setName("");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  if (workspace.error) return <p className="text-caption text-danger-700">工作空间读取失败</p>;
  if (!workspace.loading && workspace.workspaces.length === 0) {
    return (
      <div className="space-y-1">
        <span className="text-small text-muted-foreground">工作空间</span>
        {canCreate ? <button type="button" className="flex h-9 w-full items-center justify-center rounded-control bg-primary px-3 text-body font-medium text-primary-foreground hover:bg-primary-hover" onClick={() => setCreating(true)}>创建工作空间</button> : <p className="text-caption text-muted-foreground">还没有工作空间</p>}
        {creating ? (
          <Dialog title="创建工作空间" onClose={() => { if (!busy) setCreating(false); }}>
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              <Field label="名称"><Input name="name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
              {error ? <Alert>{describeFailure("创建失败", error)}</Alert> : null}
              <div className="flex justify-end"><Button type="submit" variant="primary" disabled={busy || name.trim() === ""}>创建</Button></div>
            </form>
          </Dialog>
        ) : null}
      </div>
    );
  }
  return <Select label="工作空间" value={workspace.current?.id ?? ""} disabled={!workspace.workspaces.length} onValueChange={workspace.select} options={workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))} />;
}

function NavEntry({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink to={to} className={({ isActive }) => cn(ITEM, REAL, isActive && ACTIVE)}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

function Sidebar({ onCollapse, query, setQuery, searching, setSearching }: { onCollapse: () => void; query: string; setQuery: (value: string) => void; searching: boolean; setSearching: (value: boolean | ((current: boolean) => boolean)) => void }) {
  const { principal, roles, signOut } = useIdentity();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-control bg-primary text-body font-semibold text-primary-foreground">O</span>
        <p className="text-title font-semibold text-foreground">Orbit</p>
        <button type="button" aria-label="搜索会话" aria-pressed={searching} className="ml-auto flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => setSearching((value) => !value)}>
          <Search className="h-4 w-4" />
        </button>
        <button type="button" aria-label="收起侧边栏" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={onCollapse}>
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      {searching ? (
        <div className="px-3 pb-2">
          <input autoFocus value={query} placeholder="搜索会话" aria-label="搜索会话标题" className="h-8 w-full rounded-control border border-input bg-card px-2.5 text-body outline-none placeholder:text-muted-foreground focus:border-primary-500" onChange={(event) => setQuery(event.target.value)} />
        </div>
      ) : null}
      <div className="space-y-2 px-3 pb-2">
        <WorkspacePicker />
      </div>
      <nav aria-label="主导航" className="flex shrink-0 flex-col gap-0.5 px-3">
        <NavLink to="/sessions" end className={({ isActive }) => cn(ITEM, REAL, isActive && ACTIVE)}>
          <SquarePen aria-hidden="true" className="h-4 w-4" />
          新建对话
        </NavLink>
        {NAV.map(({ group, items }) => {
          const visible = items.filter((item) => !("permission" in item) || canNavigate(roles, item.permission));
          if (!visible.length) return null;
          return (
            <div key={group || "main"} role="group" className={group ? "mt-4 flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
              {group ? <p className="mb-1 px-3 text-caption font-medium text-gray-500">{group}</p> : null}
              {visible.map((item) => (
                <NavEntry key={item.to} to={item.to} label={item.label} icon={item.icon} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <RecentSessions query={query} />
      </div>
      <div className="flex shrink-0 items-center gap-1 p-3">
        <Link to="/me" className={cn(ITEM, REAL, "min-w-0 flex-1")}>
          <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate">我</span>
          <span className="min-w-0 flex-1 truncate text-caption font-normal text-gray-500">{principal?.display_name || principal?.email}</span>
        </Link>
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
  const [collapsed, setCollapsed] = useState(() => !window.matchMedia(BREAKPOINT.sm).matches);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const { pathname } = useLocation();

  useEffect(() => {
    if (!window.matchMedia(BREAKPOINT.sm).matches) setCollapsed(true);
  }, [pathname]);

  const drawerOpen = !wide && !collapsed;
  return (
    <div className="flex h-screen bg-background text-foreground">
      {collapsed ? (
        <aside className="hidden w-12 shrink-0 flex-col items-center bg-sidebar py-3 sm:flex">
          <button type="button" aria-label="展开侧边栏" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => setCollapsed(false)}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </aside>
      ) : null}
      {drawerOpen ? <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40" onClick={() => setCollapsed(true)} /> : null}
      <aside
        aria-label="侧边栏"
        className={cn(
          "w-[256px] shrink-0 flex-col bg-sidebar text-sidebar-foreground max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-[min(256px,85vw)] max-sm:shadow-xl",
          collapsed ? "hidden" : "flex",
        )}
      >
        <Sidebar onCollapse={() => setCollapsed(true)} query={query} setQuery={setQuery} searching={searching} setSearching={setSearching} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-card">
        {collapsed ? (
          <div className="flex h-12 shrink-0 items-center gap-2 bg-sidebar px-3 sm:hidden">
            <button type="button" aria-label="打开导航" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
            </button>
            <span className="text-title font-semibold text-foreground">Orbit</span>
          </div>
        ) : null}
        <ErrorBoundary resetKey={pathname}>
          <div key={pathname} className="page-enter flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}
