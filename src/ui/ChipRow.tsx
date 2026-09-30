import { cn } from "../lib/cn";

export type Chip = { key: string; label: string };

/** 一排分类标签：单选，选中的有底色，放不下就横向滚动。 */
export function ChipRow({ label, value, chips, onChange }: { label: string; value: string; chips: readonly Chip[]; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button
          key={chip.key || "all"}
          type="button"
          aria-pressed={value === chip.key}
          className={cn("h-8 shrink-0 rounded-lg px-3 text-sm transition-colors", value === chip.key ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
          onClick={() => onChange(chip.key)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
