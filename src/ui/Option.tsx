import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * 选择器和菜单共用的选项行：只摆名字（大段说明不进来，排版才立得住），选中右边打勾。
 * `trailing` 放右侧小字（如「已添加」「正在添加…」）；`hint` 只给一行短说明（模式这类），内容选择器一律不传。
 */
export function Option({
  checked,
  kind,
  label,
  hint,
  trailing,
  id,
  title,
  disabled,
  onClick,
}: {
  checked: boolean;
  kind: "radio" | "checkbox";
  label: string;
  hint?: string;
  trailing?: ReactNode;
  /** 不显示，只给测试和调试定位这一行（比如同名的技能）。 */
  id?: string;
  /** 鼠标停在这一行上时的说明。 */
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={kind === "radio" ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      data-option-id={id}
      title={title}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-body text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
        hint ? "items-start" : "items-center",
      )}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint ? <span className="mt-0.5 block text-caption text-muted-foreground">{hint}</span> : null}
      </span>
      {trailing}
      {checked ? <Check aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-primary-700", hint && "mt-0.5")} /> : null}
    </button>
  );
}
