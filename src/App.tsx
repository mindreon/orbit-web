import { Bot, Clock, FolderKanban, GraduationCap, Library, ListChecks, PanelLeftClose, PanelLeftOpen, Plug, Settings as SettingsIcon, Sparkles, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet } from "react-router";
import { EmbedBridge } from "./embed/EmbedBridge";
import { isEmbeddedInWujie } from "./embed/wujie";
import { cn } from "./lib/cn";
import { fontSizePx, getUiPrefs, subscribeUiPrefs } from "./lib/uiPrefs";
import { GREYED_NAV_LABELS, PRIMARY_NAV, type NavIcon } from "./shell/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  "list-checks": ListChecks,
  bot: Bot,
  "folder-kanban": FolderKanban,
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
  plug: Plug,
  clock: Clock,
  library: Library,
};

const ITEM = "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm";

/** 嵌入 baize 时顶栏、菜单和主题都归基座，这里只出内容区。 */
function EmbeddedApp() {
  return (
    <div className="flex size-full min-h-0 flex-col bg-card text-foreground">
      <EmbedBridge />
      <Outlet />
    </div>
  );
}

export function App() {
  return isEmbeddedInWujie() ? <EmbeddedApp /> : <StandaloneApp />;
}

function StandaloneApp() {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  // Phones start with the sidebar closed; when opened it overlays the page instead of squeezing it.
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizePx(uiPrefs.fontSize);
    document.documentElement.dataset.compact = uiPrefs.compact ? "true" : "false";
    document.documentElement.dataset.theme = uiPrefs.theme === "深色" ? "dark" : "light";
  }, [uiPrefs]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {collapsed ? (
        <aside className="hidden w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex">
          <button type="button" aria-label="展开侧边栏" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setCollapsed(false)}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </aside>
      ) : null}
      <aside
        className={cn(
          "w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl",
          collapsed ? "hidden" : "flex",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            O
          </span>
          <p className="text-[15px] font-semibold">Orbit</p>
          <button type="button" aria-label="收起侧边栏" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setCollapsed(true)}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <nav aria-label="主导航" className="flex-1 overflow-auto px-3 pb-3">
          {PRIMARY_NAV.map((item, index) => {
            const Icon = ICONS[item.icon];
            const showGroup = index === 0 || PRIMARY_NAV[index - 1].group !== item.group;
            return (
              <Fragment key={item.to}>
                {showGroup ? <p className="mb-1 mt-4 px-3 text-xs text-muted-foreground first:mt-1">{item.group}</p> : null}
                {GREYED_NAV_LABELS.has(item.label) ? (
                  <span aria-disabled="true" className={cn(ITEM, "cursor-not-allowed text-muted-foreground/60")}>
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {item.label}
                    <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">即将</span>
                  </span>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(ITEM, "text-foreground/80 hover:bg-secondary", isActive && "bg-sidebar-accent font-medium text-accent-foreground hover:bg-sidebar-accent")}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                )}
              </Fragment>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <NavLink to="/settings" className={({ isActive }) => cn(ITEM, "text-foreground/80 hover:bg-secondary", isActive && "bg-sidebar-accent font-medium text-accent-foreground")}>
            <SettingsIcon aria-hidden="true" className="h-4 w-4" />
            设置
          </NavLink>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-card">
        {collapsed ? (
          <div className="flex h-11 shrink-0 items-center border-b border-border px-3 md:hidden">
            <button type="button" aria-label="展开侧边栏" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
