import { cn } from "../lib/cn";

/** 开关：`role="switch"`，名字用 `label`（行里已有标题时，传同一个标题）。 */
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50", checked ? "bg-primary" : "bg-gray-300")}
    >
      <span aria-hidden="true" className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform", checked && "translate-x-4")} />
    </button>
  );
}
