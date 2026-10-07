import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { PERMISSION_TEXT } from "../../lib/display";
import { PERMISSION_PRESETS, type PermissionPreset } from "../../lib/permissions";
import { BREAKPOINT, useMediaQuery } from "../../lib/useMediaQuery";
import { usePopoverClose } from "../../lib/usePopoverClose";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { PRESET_ICONS } from "../permissions/presets";

/**
 * 输入框下方的权限选择：触发按钮写着当前预设（完全访问用 danger 色），点开是「应如何批准 Agent 操作？」五行：图标、名字、淡色说明，选中的打勾。
 * 选「完全访问」前确认一次（同一个 `scope`，也就是同一个任务，只问一次；已经是完全访问的任务选回来不再问）。
 * `compact`：输入框窄的时候只留图标（名字在无障碍标签里）。窄屏（或输入框窄）时菜单贴着输入框的整个宽度，不会伸出屏幕。
 * `deferred`：任务里改权限，从下一次执行起生效，菜单底部这样说。
 */
export function PermissionChip({ value, onChange, scope, compact = false, disabled = false, deferred = false, openSignal = 0 }: { value: PermissionPreset; onChange: (next: PermissionPreset) => void; scope: string; compact?: boolean; disabled?: boolean; deferred?: boolean; /** 每加一就打开（输入框里的 / 权限）。 */ openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const confirmed = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery(BREAKPOINT.sm);
  const full = PERMISSION_TEXT[value];
  const Icon = PRESET_ICONS[value];
  const danger = value === "full";
  // 贴着输入框而不是触发按钮：这时触发按钮的容器不是定位基准，菜单相对输入框摆。
  const wholeWidth = compact || !wide;
  usePopoverClose(open && !asking, box, () => setOpen(false));

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);
  // 已经是完全访问（读到的任务配置、设置里的默认）就算确认过。
  useEffect(() => {
    if (value === "full") confirmed.current = scope;
  }, [value, scope]);

  const pick = (next: PermissionPreset) => {
    if (next === "full" && value !== "full" && confirmed.current !== scope) {
      setAsking(true);
      return;
    }
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div ref={box} className={cn("shrink-0", !wholeWidth && "relative")}>
      <button
        type="button"
        data-testid="permission-chip"
        data-preset={value}
        aria-label={`权限：${full.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`权限：${full.label}`}
        disabled={disabled}
        className={cn("flex h-8 items-center gap-1.5 rounded-control text-body hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50", danger ? "text-danger-700" : "text-gray-600 hover:text-foreground", compact ? "w-8 justify-center" : "px-2")}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {compact ? null : (
          <>
            {full.short}
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          </>
        )}
      </button>
      {open ? (
        <div role="menu" aria-label="应如何批准 Agent 操作？" data-testid="permission-menu" className={cn("menu-in absolute bottom-full z-30 mb-2 rounded-card bg-card p-1 shadow-lg ring-1 ring-border", wholeWidth ? "inset-x-0" : "left-0 w-80")}>
          <p className="px-3 pb-1 pt-2 text-small font-medium text-muted-foreground">应如何批准 Agent 操作？</p>
          {PERMISSION_PRESETS.map((preset) => {
            const text = PERMISSION_TEXT[preset];
            const RowIcon = PRESET_ICONS[preset];
            const risky = preset === "full";
            return (
              <button
                key={preset}
                type="button"
                role="menuitemradio"
                aria-checked={preset === value}
                data-preset={preset}
                className="flex w-full items-start gap-3 rounded-control px-3 py-2 text-left hover:bg-secondary"
                onClick={() => pick(preset)}
              >
                <RowIcon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", risky ? "text-danger-700" : "text-gray-600")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-body font-medium", risky ? "text-danger-700" : "text-foreground")}>{text.label}</span>
                  <span className="mt-0.5 block text-small text-muted-foreground">{text.description}</span>
                </span>
                {preset === value ? <Check aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", risky ? "text-danger-700" : "text-primary-700")} /> : null}
              </button>
            );
          })}
          {deferred ? <p data-testid="permission-deferred" className="px-3 pb-2 pt-1 text-caption text-muted-foreground">修改从下一次执行起生效，正在执行的这一次不受影响。</p> : null}
        </div>
      ) : null}
      {asking ? (
        <FullAccessDialog
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            confirmed.current = scope;
            setAsking(false);
            setOpen(false);
            onChange("full");
          }}
        />
      ) : null}
    </div>
  );
}

/** 选完全访问前的确认：说清楚会发生什么，确认键用 danger 色。设置页选默认权限时也用它。 */
export function FullAccessDialog({ onCancel, onConfirm, title = "启用完全访问权限？" }: { onCancel: () => void; onConfirm: () => void; title?: string }) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="text-body text-gray-700">沙箱内的操作会全部自动通过，不再逐项询问你。灾难性命令仍会被拒绝。</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button variant="danger" data-testid="full-access-confirm" onClick={onConfirm}>
          启用完全访问
        </Button>
      </div>
    </Dialog>
  );
}
