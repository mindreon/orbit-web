import { GraduationCap, Plug, Search, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cn } from "../lib/cn";
import { Input } from "../ui/fields";

const TABS: readonly { to: string; label: string; end: boolean; Icon: LucideIcon }[] = [
  { to: "/experts", label: "专家", end: true, Icon: GraduationCap },
  { to: "/experts/skills", label: "技能", end: false, Icon: Sparkles },
  { to: "/experts/connectors", label: "连接器", end: false, Icon: Plug },
];

interface CatalogHeaderProps {
  /** 当前页的名字，给屏幕阅读器用的一级标题。 */
  readonly title: string;
  readonly search?: { readonly value: string; readonly onChange: (value: string) => void; readonly placeholder: string };
  /** 右上角的主操作，比如「创建专家」。 */
  readonly children?: ReactNode;
}

/** 专家、技能、连接器三页共用的顶栏：左边是三个页签，右边是搜索和主操作。 */
export function CatalogHeader({ title, search, children }: CatalogHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
      <h1 className="sr-only">{title}</h1>
      <nav aria-label="目录" className="flex items-center gap-1">
        {TABS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm", isActive ? "bg-foreground font-medium text-background" : "text-foreground/70 hover:bg-secondary")}>
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {search ? (
          <label className="relative hidden sm:block">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={search.placeholder} value={search.value} placeholder={search.placeholder} className="w-64 pl-9" onChange={(event) => search.onChange(event.target.value)} />
          </label>
        ) : null}
        {children}
      </div>
    </header>
  );
}
