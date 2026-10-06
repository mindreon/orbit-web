import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

/** 输入框里「/」唤出的一条命令：它只是已有操作的快捷入口，不是新功能。 */
export interface SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly Icon: LucideIcon;
  readonly run: () => void;
}

/** 命令列表：贴着输入框的上沿、和它一样宽；一行 32px，图标、名称、淡色说明。 */
export function SlashMenu({ items, active, onPick, onHover }: { items: readonly SlashCommand[]; active: number; onPick: (index: number) => void; onHover: (index: number) => void }) {
  return (
    <ul role="listbox" aria-label="命令" data-testid="slash-menu" className="menu-in absolute inset-x-0 bottom-full z-20 mb-2 max-h-64 overflow-y-auto rounded-card bg-card p-1 shadow-lg ring-1 ring-border">
      {items.map((item, index) => (
        <li key={item.id} role="option" aria-selected={index === active} data-testid="slash-item" data-command={item.id}>
          <button
            type="button"
            tabIndex={-1}
            className={cn("flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-body text-foreground", index === active && "bg-secondary")}
            // mousedown 不抢文本框的焦点
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(index);
            }}
            onMouseEnter={() => onHover(index)}
          >
            <item.Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-600" />
            <span className="shrink-0 font-medium">{item.label}</span>
            <span className="min-w-0 flex-1 truncate text-small text-muted-foreground">{item.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
