import { PanelLeftOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Outlet, useLocation } from "react-router";
import { EmbedBridge } from "./embed/EmbedBridge";
import { isEmbeddedInWujie } from "./embed/wujie";
import { cn } from "./lib/cn";
import { BREAKPOINT, useMediaQuery } from "./lib/useMediaQuery";
import { fontSizePx, getUiPrefs, subscribeUiPrefs } from "./lib/uiPrefs";
import { Sidebar } from "./shell/Sidebar";

/** 嵌入 baize 时顶栏、菜单和主题都归基座，这里只出内容区。 */
function EmbeddedApp() {
  const location = useLocation();
  return (
    <div className="flex size-full min-h-0 flex-col bg-card text-foreground">
      <EmbedBridge />
      <div key={location.pathname} className="page-enter flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}

export function App() {
  return isEmbeddedInWujie() ? <EmbeddedApp /> : <StandaloneApp />;
}

function StandaloneApp() {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  const wide = useMediaQuery(BREAKPOINT.sm);
  // Phones start with the sidebar closed; when opened it is a drawer over the page, not a column squeezing it.
  const [collapsed, setCollapsed] = useState(() => !window.matchMedia(BREAKPOINT.sm).matches);
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizePx(uiPrefs.fontSize);
    document.documentElement.dataset.compact = uiPrefs.compact ? "true" : "false";
    document.documentElement.dataset.theme = uiPrefs.theme === "深色" ? "dark" : "light";
  }, [uiPrefs]);

  // Going to a page from the drawer closes it.
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
      {drawerOpen ? <div aria-hidden="true" data-testid="sidebar-backdrop" className="fixed inset-0 z-30 bg-black/40" onClick={() => setCollapsed(true)} /> : null}
      <aside
        aria-label="侧边栏"
        className={cn(
          "w-[256px] shrink-0 flex-col bg-sidebar text-sidebar-foreground max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-[min(256px,85vw)] max-sm:shadow-xl",
          collapsed ? "hidden" : "flex",
        )}
      >
        <Sidebar onCollapse={() => setCollapsed(true)} />
      </aside>
      <ContentPane collapsed={collapsed} onExpand={() => setCollapsed(false)} />
    </div>
  );
}

/** 内容区。key 取路由路径：换页时整块轻淡入，而不是生硬跳变。 */
function ContentPane({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter flex min-w-0 flex-1 flex-col bg-card">
      {collapsed ? (
        <div className="flex h-12 shrink-0 items-center gap-2 bg-sidebar px-3 sm:hidden">
          <button type="button" aria-label="展开侧边栏" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={onExpand}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <span className="text-title font-semibold text-foreground">Orbit</span>
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}
