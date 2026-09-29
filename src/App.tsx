import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet } from "react-router";
import { cn } from "./lib/cn";
import { fontSizePx, getUiPrefs, subscribeUiPrefs } from "./lib/uiPrefs";
import { GREYED_NAV_LABELS, PRIMARY_NAV } from "./shell/nav";

export function App() {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  // Phones start with the sidebar closed; when opened it overlays the page instead of squeezing it.
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizePx(uiPrefs.fontSize);
    document.documentElement.dataset.compact = uiPrefs.compact ? "true" : "false";
    document.documentElement.dataset.theme = uiPrefs.theme === "深色" ? "dark" : "light";
  }, [uiPrefs]);

  return (
    <div className="flex h-screen bg-[#f3f3f4] text-[#1a1a1a]">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-[#e8e8ea] transition-[width] max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:bg-[#f3f3f4]",
          collapsed ? "w-0 overflow-hidden border-r-0" : "w-[220px] max-md:shadow-xl",
        )}
      >
        <div className="flex h-14 items-center gap-1 px-3">
          <button type="button" aria-label="收起侧边栏" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#e8e8ea]" onClick={() => setCollapsed(true)}>
            〈
          </button>
          <p className="ml-1 text-sm font-semibold">Orbit</p>
        </div>
        <nav aria-label="主导航" className="flex-1 space-y-0.5 overflow-auto px-2">
          {PRIMARY_NAV.map((item) =>
            GREYED_NAV_LABELS.has(item.label) ? (
              <span key={item.to} aria-disabled="true" className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-[#b0b0b0]">
                {item.label} · 未接入
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn("block rounded-lg px-3 py-2 text-sm hover:bg-[#e8e8ea]", isActive && "bg-white font-medium")}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="border-t border-[#e8e8ea] p-2">
          <NavLink to="/settings" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#e8e8ea]">
            设置
          </NavLink>
        </div>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        {collapsed ? (
          <button type="button" aria-label="展开侧边栏" className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#e8e8ea]" onClick={() => setCollapsed(false)}>
            〉
          </button>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
