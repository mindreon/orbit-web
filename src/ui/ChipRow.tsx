import { cn } from "../lib/cn";

export type Chip = { key: string; label: string; /** 数量：用淡的小字跟在名字后面。 */ count?: number };

/** 一排分类标签：单选，选中的有底色，放不下就横向滚动。 */
export function ChipRow({ label, value, chips, onChange }: { label: string; value: string; chips: readonly Chip[]; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button
          key={chip.key || "all"}
          type="button"
          aria-pressed={value === chip.key}
          className={cn("h-8 shrink-0 rounded-control px-3 text-body transition-colors", value === chip.key ? "bg-primary-100 font-medium text-primary-700" : "bg-card text-gray-700 hover:bg-gray-100")}
          onClick={() => onChange(chip.key)}
        >
          {chip.label}
          {chip.count === undefined ? null : " "}
          {chip.count === undefined ? null : <span className={cn("ml-1 text-caption font-normal", value === chip.key ? "text-primary-700" : "text-muted-foreground")}>{chip.count}</span>}
        </button>
      ))}
    </div>
  );
}
