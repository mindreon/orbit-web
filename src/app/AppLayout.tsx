import { LogOut, Menu, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { BREAKPOINT, useMediaQuery } from "../lib/useMediaQuery";
import { useAuth } from "./auth/context";
import { ErrorBoundary } from "./ErrorBoundary";

/** Only pages that exist are listed. */
const NAV: readonly { to: string; label: string; icon: LucideIcon }[] = [{ to: "/me", label: "我", icon: UserRound }];

function Sidebar() {
  const { principal, currentTenant, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <p className="px-4 py-4 text-title font-semibold text-foreground">Orbit</p>
      <nav aria-label="主导航" className="flex-1 space-y-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-control px-3 text-body", isActive ? "bg-sidebar-accent font-medium text-primary-700" : "text-gray-700 hover:bg-gray-200")}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-foreground">{principal?.display_name || principal?.email}</p>
          <p className="truncate text-caption text-muted-foreground">{currentTenant?.name}</p>
        </div>
        <button type="button" aria-label="退出登录" title="退出登录" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => void logout()}>
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
        <aside className={cn("w-64 shrink-0 bg-sidebar text-sidebar-foreground", !wide && "fixed inset-y-0 left-0 z-40 w-[min(16rem,85vw)] shadow-xl")}>
          <Sidebar />
        </aside>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col bg-card">
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
