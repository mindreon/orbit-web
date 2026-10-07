/** 任务怎么批准 Agent 的操作：五个预设，加上「自定义」用到的读写范围和自动审批规则（后端的 PermissionSpec）。 */
export type PermissionPreset = "default" | "request" | "auto" | "full" | "custom";
export type WriteScope = "none" | "workspace";

/** 预设按从严到松的顺序，「自定义」排在最后。 */
export const PERMISSION_PRESETS: readonly PermissionPreset[] = ["default", "request", "auto", "full", "custom"];

export type PermissionSpec = {
  preset: PermissionPreset;
  write_scope?: WriteScope;
  auto_edits?: boolean;
  auto_commands?: boolean;
  auto_builtin?: boolean;
};

/** 「自定义」预设展开后的规则，保存在设置里。 */
export type CustomPermissions = {
  write_scope: WriteScope;
  auto_edits: boolean;
  auto_commands: boolean;
  auto_builtin: boolean;
};

/** 没保存过设置时的自定义规则（和控制面的默认一致）。 */
export const DEFAULT_CUSTOM: CustomPermissions = { write_scope: "workspace", auto_edits: true, auto_commands: false, auto_builtin: false };

export const isPreset = (value: unknown): value is PermissionPreset => typeof value === "string" && (PERMISSION_PRESETS as readonly string[]).includes(value);
