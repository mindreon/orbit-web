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

const ITEM = "flex h-9 items-center gap-2.5 rounded-control px-3 text-body";
const ACTIVE = "bg-sidebar-accent font-medium text-primary-700 hover:bg-sidebar-accent";
const REAL = "font-medium text-gray-800 hover:bg-gray-200";
/** 还没开放的入口：字更轻、更浅，别和能用的抢眼。 */
const SOON = "font-normal text-gray-500 hover:bg-gray-200";

function link(soon: boolean) {
  return ({ isActive }: { isActive: boolean }) => cn(ITEM, soon ? SOON : REAL, isActive && ACTIVE);
}

function NavEntry({ item }: { item: NavItem }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink to={item.to} end={item.end} className={link(Boolean(item.soon))}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {item.label}
      {item.soon ? <span className="ml-auto text-caption text-gray-500">即将</span> : null}
    </NavLink>
  );
}

/** 分组标题贴着自己的分组：上面留 16px+，下面只有 4px，一眼看出它管下面的几项。 */
function NavGroup({ id, label }: { id: NavGroupId; label: string }) {
  const items = PRIMARY_NAV.filter((item) => item.group === id);
  if (items.length === 0) return null;
  return (
    <div role="group" aria-labelledby={`nav-group-${id}`} data-testid="nav-group" className="mt-4 flex flex-col gap-0.5">
      <p id={`nav-group-${id}`} className="mb-1 px-3 text-caption font-medium text-gray-500">
        {label}
      </p>
      {items.map((item) => (
        <NavEntry key={item.to} item={item} />
      ))}
    </div>
  );
}

/** 独立部署时的左侧栏。嵌入 baize 后由基座提供导航，不渲染这个。 */
export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-control bg-primary text-body font-semibold text-primary-foreground">
          O
        </span>
        <p className="text-title font-semibold text-foreground">Orbit</p>
        <button type="button" aria-label="搜索任务" aria-pressed={searching} className="ml-auto flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => setSearching((value) => !value)}>
          <Search className="h-4 w-4" />
        </button>
        <button type="button" aria-label="收起侧边栏" className="flex h-8 w-8 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={onCollapse}>
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
            className="h-8 w-full rounded-control border border-input bg-card px-2.5 text-body outline-none placeholder:text-muted-foreground focus:border-primary-500"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      <nav aria-label="主导航" className="flex shrink-0 flex-col gap-0.5 px-3">
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
      <div className="shrink-0 p-3">
        <NavLink to="/settings" className={link(false)}>
          <SettingsIcon aria-hidden="true" className="h-4 w-4" />
          设置
        </NavLink>
      </div>
    </>
  );
}
