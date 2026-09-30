import { PanelLeftOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Outlet } from "react-router";
import { EmbedBridge } from "./embed/EmbedBridge";
import { isEmbeddedInWujie } from "./embed/wujie";
import { cn } from "./lib/cn";
import { fontSizePx, getUiPrefs, subscribeUiPrefs } from "./lib/uiPrefs";
import { Sidebar } from "./shell/Sidebar";

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
          "w-[256px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl",
          collapsed ? "hidden" : "flex",
        )}
      >
        <Sidebar onCollapse={() => setCollapsed(true)} />
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
