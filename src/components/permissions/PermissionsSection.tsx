import { Check } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { PERMISSION_TEXT } from "../../lib/display";
import { PERMISSION_PRESETS, type PermissionPreset, type WriteScope } from "../../lib/permissions";
import { useSettings, type Settings } from "../../lib/settings";
import { Alert } from "../../ui/Alert";
import { Skeleton } from "../../ui/Skeleton";
import { Switch } from "../../ui/Switch";
import { SegmentedRadio } from "../../ui/Tabs";
import { panelClass } from "../../ui/card";
import { FullAccessDialog } from "../tasks/PermissionChip";
import { PRESET_ICONS } from "./presets";

const WRITE_SCOPES: readonly { id: WriteScope; label: string }[] = [
  { id: "none", label: "禁止写入" },
  { id: "workspace", label: "仅工作区" },
];
const READ_SCOPES = [{ id: "workspace", label: "仅工作区" }] as const;

/** 一行设置：左边标题和淡色说明，右边是控件；窄屏放不下时控件换到下一行。 */
function SettingRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-body font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-small text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * 设置 → 权限：新任务的默认权限（五选一）和「自定义权限」的读写范围、自动审批规则。
 * 修改自动保存（停下 300ms 后整体提交），保存失败回到上一次保存的样子并说明原因，所以没有「保存」按钮。
 */
export function PermissionsSection() {
  const { settings, status, saving, saved, error, save } = useSettings();
  const [asking, setAsking] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const editable = status === "ready";
  const { default_preset: preset, custom } = settings.permissions;
  const update = (next: Partial<Settings["permissions"]>) => save({ permissions: { ...settings.permissions, ...next } });
  const setCustom = (next: Partial<Settings["permissions"]["custom"]>) => update({ custom: { ...custom, ...next } });

  const choose = (next: PermissionPreset) => {
    if (!editable || next === preset) return;
    if (next === "full") setAsking(true);
    else update({ default_preset: next });
  };
  // 单选组的键盘：方向键在行之间移动并选中。
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step || !editable) return;
    event.preventDefault();
    const next = PERMISSION_PRESETS[(PERMISSION_PRESETS.indexOf(preset) + step + PERMISSION_PRESETS.length) % PERMISSION_PRESETS.length];
    group.current?.querySelector<HTMLElement>(`[data-preset="${next}"]`)?.focus();
    choose(next);
  };
  const noWrite = custom.write_scope === "none";

  if (status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-72 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="permissions-section">
      {status === "readonly" ? <Alert tone="info">这个部署的控制面还没有设置接口：下面是默认值，暂时不能修改。</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className={cn(panelClass, "p-4")}>
        <p className="text-body font-semibold text-foreground">新任务默认权限</p>
        <p className="mt-0.5 text-small text-muted-foreground">新建任务时输入框里的初始权限；每个任务都可以在输入框里单独改。</p>
        <div ref={group} role="radiogroup" aria-label="新任务默认权限" onKeyDown={onKeyDown} className="mt-3 space-y-0.5">
          {PERMISSION_PRESETS.map((item) => {
            const text = PERMISSION_TEXT[item];
            const Icon = PRESET_ICONS[item];
            const selected = item === preset;
            const risky = item === "full";
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={selected}
                data-preset={item}
                disabled={!editable}
                tabIndex={selected ? 0 : -1}
                className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:hover:bg-transparent"
                onClick={() => choose(item)}
              >
                <Icon aria-hidden="true" className={cn("h-5 w-5 shrink-0", risky ? "text-danger-700" : "text-gray-600")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-body font-medium", risky ? "text-danger-700" : "text-foreground")}>{text.label}</span>
                  <span className="mt-0.5 block text-small text-muted-foreground">{text.description}</span>
                </span>
                <span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {selected ? <Check className="h-3 w-3" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn(panelClass, "p-4")}>
        <p className="text-body font-semibold text-foreground">自定义权限</p>
        <p className="mt-0.5 text-small text-muted-foreground">选「自定义权限」的任务按这里的范围和规则执行。</p>
        <div className="mt-2 divide-y divide-border">
          <SettingRow title="读取权限" hint="文件只能在任务的工作区内读取；Orbit 是多人共用的服务端，不提供「所有位置」。">
            <SegmentedRadio label="读取权限" value="workspace" options={READ_SCOPES} onChange={() => undefined} disabled />
          </SettingRow>
          <SettingRow title="写入权限" hint="任务可以修改文件的范围。">
            <SegmentedRadio label="写入权限" value={custom.write_scope} options={WRITE_SCOPES} disabled={!editable} onChange={(write_scope) => setCustom({ write_scope })} />
          </SettingRow>
          <SettingRow title="编辑文件无需审批" hint={noWrite ? "已禁止写入，这一项不起作用。" : "开启后，在允许的写入范围内自动应用文件修改。"}>
            <Switch label="编辑文件无需审批" checked={custom.auto_edits && !noWrite} disabled={!editable || noWrite} onChange={(auto_edits) => setCustom({ auto_edits })} />
          </SettingRow>
          <SettingRow title="运行命令无需审批" hint="开启后，通过风险校验的命令会自动执行，有风险的仍会询问。">
            <Switch label="运行命令无需审批" checked={custom.auto_commands} disabled={!editable} onChange={(auto_commands) => setCustom({ auto_commands })} />
          </SettingRow>
          <SettingRow title="内置能力无需审批" hint="开启后，内置技能的脚本和工具执行无需审批。">
            <Switch label="内置能力无需审批" checked={custom.auto_builtin} disabled={!editable} onChange={(auto_builtin) => setCustom({ auto_builtin })} />
          </SettingRow>
        </div>
      </div>

      <p role="status" data-testid="settings-save-state" className="px-1 text-caption text-muted-foreground">
        {!editable ? "" : saving ? "正在保存…" : saved ? "已保存" : "修改会自动保存"}
      </p>

      {asking ? (
        <FullAccessDialog
          title="把完全访问权限设为新任务的默认？"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            update({ default_preset: "full" });
          }}
        />
      ) : null}
    </div>
  );
}
