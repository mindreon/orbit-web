import { cn } from "../lib/cn";

/** 分段控件，排序、页签切换共用。 */
export function SegmentedTabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-control bg-secondary p-0.5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cn("h-8 rounded-control px-3 text-body transition-colors", value === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 区块标题式的页签（大字号，选中的更深），像广场页的"全部 / ModelScope / NEXA"。 */
export function HeadingTabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-baseline gap-5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={cn("text-title transition-colors", value === item.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
