import { cn } from "../lib/cn";

export type CategoryOption = { key: string; name: string; count?: number };

/** 左侧分类栏（大屏）。选中已选项再点一次不取消，「全部」是显式的一项。 */
export function CategoryPanel({ title, value, options, onChange }: { title: string; value: string; options: readonly CategoryOption[]; onChange: (key: string) => void }) {
  const row = "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm";
  return (
    <aside aria-label={title} className="hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-card p-3 lg:block">
      <p className="mb-2 px-3 text-xs text-muted-foreground">{title}</p>
      <button type="button" className={cn(row, value === "" ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-secondary")} onClick={() => onChange("")}>
        全部
      </button>
      {options.map((item) => (
        <button key={item.key} type="button" className={cn(row, value === item.key ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-secondary")} onClick={() => onChange(item.key)}>
          <span className="min-w-0 truncate">{item.name}</span>
          {item.count != null ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.count}</span> : null}
        </button>
      ))}
    </aside>
  );
}
