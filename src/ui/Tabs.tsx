import { cn } from "../lib/cn";

/** 分段控件，排序、页签切换共用。 */
export function SegmentedTabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-secondary p-0.5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cn("h-8 rounded-md px-3 text-sm transition-colors", value === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 区块标题式的页签（大字号，选中的更深），像 WorkBuddy 的"推荐 / SkillHub / 套件"。 */
export function HeadingTabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-baseline gap-5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cn("text-lg transition-colors", value === item.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
