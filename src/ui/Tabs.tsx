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

/** 分段的单选：外观和 SegmentedTabs 一样，语义是一组 radio（选一个值，不是切换页面）。`disabled` 的整组不可改。 */
export function SegmentedRadio<T extends string>({ label, value, options, onChange, disabled = false }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className="inline-flex shrink-0 rounded-control bg-secondary p-0.5">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          disabled={disabled}
          className={cn("h-8 rounded-control px-3 text-body transition-colors disabled:cursor-not-allowed", value === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground enabled:hover:text-foreground", disabled && "opacity-60")}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
