import { X, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

/** 已选项的胶囊：图标 + 名字 + ×，和输入框下方那排（ConfigChips）同一个 WorkBuddy 样子。 */
export function Chip({ icon: Icon, iconClass, label, onRemove }: { icon: LucideIcon; iconClass?: string; label: string; onRemove: () => void }) {
  return (
    <li data-testid="chosen-chip" className="flex h-7 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption text-foreground">
      <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", iconClass ?? "text-primary-700")} />
      <span className="max-w-40 truncate" title={label}>
        {label}
      </span>
      <button type="button" aria-label={`移除 ${label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-200" onClick={onRemove}>
        <X aria-hidden="true" className="h-3 w-3" />
      </button>
    </li>
  );
}

/** 一排胶囊；没选东西就不渲染，不占地方。 */
export function ChipList({ label, chips }: { label: string; chips: readonly React.ReactNode[] }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label={label} className="mb-2 flex flex-wrap gap-1.5">
      {chips}
    </ul>
  );
}
