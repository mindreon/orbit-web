import { Check } from "lucide-react";

/** 菜单里的一行：单选或多选，选中的右边打勾。 */
export function Option({ checked, kind, label, hint, onClick }: { checked: boolean; kind: "radio" | "checkbox"; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role={kind === "radio" ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {checked ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
    </button>
  );
}
