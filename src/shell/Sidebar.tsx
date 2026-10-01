import { Bot, Clock, FolderKanban, Library, PanelLeftClose, Plug, Search, Settings as SettingsIcon, Sparkles, SquarePen, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router";
import { cn } from "../lib/cn";
import { NAV_GROUPS, PRIMARY_NAV, type NavGroupId, type NavIcon, type NavItem } from "./nav";
import { TaskListSection } from "./TaskListSection";

const ICONS: Record<NavIcon, LucideIcon> = {
  "square-pen": SquarePen,
  sparkles: Sparkles,
  bot: Bot,
  plug: Plug,
  "folder-kanban": FolderKanban,
  clock: Clock,
  library: Library,
};

const ITEM = "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm";
const ACTIVE = "bg-sidebar-accent font-medium text-accent-foreground hover:bg-sidebar-accent";

function link() {
  return ({ isActive }: { isActive: boolean }) => cn(ITEM, "text-foreground/80 hover:bg-secondary", isActive && ACTIVE);
}

function NavEntry({ item }: { item: NavItem }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink to={item.to} end={item.end} className={link()}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {item.label}
      {item.soon ? <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">即将</span> : null}
    </NavLink>
  );
}

function NavGroup({ id, label }: { id: NavGroupId; label: string }) {
  const items = PRIMARY_NAV.filter((item) => item.group === id);
  if (items.length === 0) return null;
  return (
    <>
      <p className="mt-4 flex h-6 items-center px-3 text-[12px] font-medium text-muted-foreground">{label}</p>
      {items.map((item) => (
        <NavEntry key={item.to} item={item} />
      ))}
    </>
  );
}

/** 独立部署时的左侧栏。嵌入 baize 后由基座提供导航，不渲染这个。 */
export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          O
        </span>
        <p className="text-[15px] font-semibold">Orbit</p>
        <button type="button" aria-label="搜索任务" aria-pressed={searching} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setSearching((value) => !value)}>
          <Search className="h-4 w-4" />
        </button>
        <button type="button" aria-label="收起侧边栏" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={onCollapse}>
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      {searching ? (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={query}
            placeholder="搜索任务"
            aria-label="搜索任务标题"
            className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      <nav aria-label="主导航" className="shrink-0 space-y-0.5 px-3">
        {PRIMARY_NAV.filter((item) => !item.group).map((item) => (
          <NavEntry key={item.to} item={item} />
        ))}
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.id} id={group.id} label={group.label} />
        ))}
      </nav>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <TaskListSection query={query} />
      </div>
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <NavLink to="/settings" className={link()}>
          <SettingsIcon aria-hidden="true" className="h-4 w-4" />
          设置
        </NavLink>
      </div>
    </>
  );
}
