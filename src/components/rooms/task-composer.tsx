"use client";

import { ArrowUp, Paperclip, Square, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ComposerMode } from "@/lib/rooms-ui";
import type { PermissionPreset } from "@/lib/control";

const MODES: { id: ComposerMode; label: string; hint: string }[] = [
  { id: "execute", label: "执行", hint: "直接执行任务" },
  { id: "plan", label: "先计划", hint: "先出计划再确认" },
  { id: "ask", label: "仅问答", hint: "只回答，不改文件" },
  { id: "steer", label: "调整方向", hint: "中途转向（steer）" },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  permissionPreset: PermissionPreset;
  onPermissionChange: (preset: PermissionPreset) => void;
  collabIntent: boolean;
  onCollabIntentChange: (value: boolean) => void;
  running: boolean;
  disabled?: boolean;
  busy?: boolean;
  emptyCreate?: boolean;
  onSubmit: () => void;
  onStop: () => void;
  placeholder?: string;
};

export function TaskComposer({
  value,
  onChange,
  mode,
  onModeChange,
  permissionPreset,
  onPermissionChange,
  collabIntent,
  onCollabIntentChange,
  running,
  disabled,
  busy,
  emptyCreate,
  onSubmit,
  onStop,
  placeholder,
}: Props) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-[0_1px_2px_rgba(17,19,24,0.05)]">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          placeholder ??
          (emptyCreate
            ? "描述任务目标，发送即创建房间…"
            : "描述目标，或继续补充上下文…")
        }
        disabled={disabled || busy}
        rows={3}
        className="min-h-[72px] resize-none border-0 p-0 shadow-none focus-visible:ring-0"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (!busy && value.trim()) onSubmit();
          }
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-1">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.hint}
              disabled={disabled || busy}
              onClick={() => onModeChange(item.id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                mode === item.id
                  ? "bg-primary-soft text-primary-hover"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={collabIntent}
            disabled={disabled || busy}
            onChange={(event) => onCollabIntentChange(event.target.checked)}
            className="size-3.5 rounded border-input accent-primary"
          />
          <Users className="size-3.5" aria-hidden />
          协作
        </label>
        <select
          aria-label="权限预设"
          value={permissionPreset}
          disabled={disabled || busy}
          onChange={(event) =>
            onPermissionChange(event.target.value as PermissionPreset)
          }
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="workspace-write">工作区可写</option>
          <option value="danger-full-access">完全访问</option>
        </select>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" aria-hidden />
          附件（稍后）
        </span>
        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onStop}
              title="停止当前回合"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
              停止
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={disabled || busy || !value.trim()}
            onClick={onSubmit}
          >
            <ArrowUp className="size-3.5" aria-hidden />
            {mode === "steer" ? "转向" : emptyCreate ? "开始任务" : "发送"}
          </Button>
        </div>
      </div>
      {permissionPreset === "danger-full-access" ? (
        <p className="mt-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-warning-foreground">
          完全访问会关闭默认审批，仅用于明确授权的受控环境。
        </p>
      ) : null}
      {mode === "ask" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          仅问答：前端会附加「不改文件 / 不调写工具」约定。
        </p>
      ) : null}
      {mode === "plan" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          先计划：首轮只产出计划；确认后再发送执行。
        </p>
      ) : null}
    </div>
  );
}
