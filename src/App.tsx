import { NavLink, useLocation } from "react-router";
import { CapabilitiesPage } from "./pages/Capabilities";
import { WorkbenchPage } from "./pages/Workbench";
import { ROLES, RUNTIME_KERNEL, runtimeLabel, type Role } from "./model";
import { useMind } from "./store";
import { cn } from "./lib/cn";
import { useState } from "react";

export function App() {
  const location = useLocation();
  const role = useMind((s) => s.role);
  const setRole = useMind((s) => s.setRole);
  const [open, setOpen] = useState(false);
  const onMatters = location.pathname !== "/capabilities";

  return (
    <div className="flex h-screen flex-col">
      <header className="bg-sidebar flex h-14 shrink-0 items-center gap-6 border-b border-sidebar-border px-5">
        <span className="text-primary text-base font-semibold">MindBuddy</span>
        <span className="text-muted-foreground text-xs" title="控制面里的运行时身份。这个页面仍用本地数据。">
          {runtimeLabel(RUNTIME_KERNEL)}
        </span>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5",
                isActive ? "bg-sidebar-accent text-accent-foreground" : "text-muted-foreground",
              )
            }
          >
            事项
          </NavLink>
          <NavLink
            to="/capabilities"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5",
                isActive ? "bg-sidebar-accent text-accent-foreground" : "text-muted-foreground",
              )
            }
          >
            能力
          </NavLink>
        </nav>
        <div className="relative ml-auto">
          <button
            className="border-input bg-card h-9 rounded-lg border px-3 text-sm"
            onClick={() => setOpen((value) => !value)}
          >
            {role}
          </button>
          {open ? (
            <div className="bg-card absolute right-0 z-20 mt-1 w-32 rounded-lg border p-1 shadow">
              {ROLES.map((item) => (
                <button
                  key={item}
                  className="hover:bg-accent block w-full rounded-md px-2 py-1.5 text-left text-sm"
                  onClick={() => {
                    setRole(item as Role);
                    setOpen(false);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      {onMatters ? <WorkbenchPage /> : <CapabilitiesPage />}
    </div>
  );
}

