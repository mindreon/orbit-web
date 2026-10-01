import { api } from "./api";

/** 任务带着什么运行：专家、技能、连接器和模式。技能与连接器是完整集合：null 沿用专家的默认，[] 明确清空。 */
export type ConfigMode = "default" | "plan" | "ask";

export const MODE_OPTIONS: ReadonlyArray<{ id: ConfigMode; label: string; description: string }> = [
  { id: "default", label: "默认", description: "按目标规划并执行，需要时向你确认" },
  { id: "plan", label: "计划", description: "先规划再执行（目前与默认一致，任务本来就先规划）" },
  { id: "ask", label: "仅问答", description: "只读：只回答问题，不修改任何文件" },
];

export type TaskConfigView = {
  config_version: number;
  expert: string | null;
  skills: string[] | null;
  connector_ids: string[] | null;
  mode: string;
};

export type TaskConfigInput = {
  expert?: string;
  skills?: string[] | null;
  connector_ids?: string[] | null;
  mode?: ConfigMode;
};

export function getTaskConfig(taskId: string): Promise<TaskConfigView> {
  return api<TaskConfigView>(`/v1/tasks/${encodeURIComponent(taskId)}/config`);
}

/** 新配置从任务的下一次执行起生效；`base` 是你读到的版本，过期会被拒绝（409）。 */
export function updateTaskConfig(taskId: string, base: number, input: TaskConfigInput) {
  return api<{ config_version: number; effective: string }>(`/v1/tasks/${encodeURIComponent(taskId)}/config`, {
    method: "PUT",
    body: JSON.stringify({ base_config_version: base, ...input }),
  });
}

/** 菜单里正在编辑的配置。`labels` 只用来显示技能名，不会发给后端。 */
export type ConfigDraft = {
  expert: string;
  skills: string[] | null;
  connectorIds: string[] | null;
  mode: ConfigMode;
  labels: Readonly<Record<string, string>>;
};

export const emptyDraft: ConfigDraft = { expert: "", skills: null, connectorIds: null, mode: "default", labels: {} };

export const isDefaultDraft = (draft: ConfigDraft) =>
  draft.expert === "" && draft.skills === null && draft.connectorIds === null && draft.mode === "default";

export function draftToInput(draft: ConfigDraft): TaskConfigInput {
  return {
    ...(draft.expert ? { expert: draft.expert } : {}),
    skills: draft.skills,
    connector_ids: draft.connectorIds,
    mode: draft.mode,
  };
}

export function viewToDraft(view: TaskConfigView): ConfigDraft {
  return {
    expert: view.expert ?? "",
    skills: view.skills,
    connectorIds: view.connector_ids,
    mode: (["default", "plan", "ask"].includes(view.mode) ? view.mode : "default") as ConfigMode,
    labels: {},
  };
}

/** 两份配置是否一样（忽略只用来显示的名字）。 */
export function sameDraft(a: ConfigDraft, b: ConfigDraft): boolean {
  const same = (x: string[] | null, y: string[] | null) => (x === null || y === null ? x === y : x.length === y.length && x.every((item, i) => item === y[i]));
  return a.expert === b.expert && a.mode === b.mode && same(a.skills, b.skills) && same(a.connectorIds, b.connectorIds);
}
