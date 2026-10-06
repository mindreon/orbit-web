import { api } from "./api";

/** 任务带着什么运行：专家、技能、连接器和模式。技能与连接器是完整集合：null 沿用专家的默认，[] 明确清空。 */
export type ConfigMode = "default" | "plan" | "ask";

export const MODE_OPTIONS: ReadonlyArray<{ id: ConfigMode; label: string; description: string }> = [
  { id: "default", label: "默认", description: "按目标规划并执行，需要时向你确认" },
  { id: "plan", label: "计划", description: "先规划再执行（目前与默认一致，任务本来就先规划）" },
  { id: "ask", label: "仅问答", description: "只读：只回答问题，不修改任何文件" },
];

/** 任务选的是专家团时，配置里带着它的领队和成员（成员的 `name` 是那个版本的专家名）。此时 `expert` 是领队的专家。 */
export type TeamView = {
  /** 专家团自己的引用（后端给的）；改任务配置时用 `team_ref` 把它送回去。 */
  ref?: string;
  leader: string;
  members: Array<{ role: string; expert: string; name?: string; description?: string; label?: string }>;
};

export type TaskConfigView = {
  config_version: number;
  expert: string | null;
  skills: string[] | null;
  connector_ids: string[] | null;
  mode: string;
  /** 任务级模型覆盖；空 = 用专家配置的模型，专家也没有就用部署默认（`ORBIT_MODEL_NAME`）。 */
  model?: string;
  /** 任务选的专家团自己的引用；原样送回 `team_ref` 就不会丢掉团队。 */
  team_ref?: string | null;
  team?: TeamView | null;
};

export type TaskConfigInput = {
  expert?: string;
  /** 选专家团：用它自己的引用，`expert` 不用写。 */
  team_ref?: string;
  skills?: string[] | null;
  connector_ids?: string[] | null;
  mode?: ConfigMode;
  /** 空串会清掉之前的模型选择，回到专家（再退到部署默认）的模型。 */
  model?: string;
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
  /** 专家的版本引用；选的是专家团时是专家团自己的引用（后端据此展开成领队和成员），不是领队的。 */
  expert: string;
  /** 任务级模型覆盖；"" = 用专家（再退到部署默认）的模型。 */
  model: string;
  skills: string[] | null;
  connectorIds: string[] | null;
  mode: ConfigMode;
  labels: Readonly<Record<string, string>>;
  /** 选的是专家团时，它的领队和成员；只用来显示，不会发给后端。 */
  team: TeamView | null;
  teamName: string;
};

export const emptyDraft: ConfigDraft = { expert: "", model: "", skills: null, connectorIds: null, mode: "default", labels: {}, team: null, teamName: "" };

export const isDefaultDraft = (draft: ConfigDraft) =>
  draft.expert === "" && draft.model === "" && draft.skills === null && draft.connectorIds === null && draft.mode === "default";

export function draftToInput(draft: ConfigDraft): TaskConfigInput {
  return {
    // A team is chosen by its own ref; the leader's expert comes with it.
    ...(draft.expert ? (draft.team ? { team_ref: draft.expert } : { expert: draft.expert }) : {}),
    // 模型总是带着：空串把之前的选择清掉。
    model: draft.model,
    skills: draft.skills,
    connector_ids: draft.connectorIds,
    mode: draft.mode,
  };
}

/** 读回来的配置变成草稿。选了专家团时，草稿里的 `expert` 是后端给的 `team_ref`，不是领队的专家。 */
export function viewToDraft(view: TaskConfigView): ConfigDraft {
  const team = view.team ?? null;
  const teamRef = view.team_ref ?? team?.ref ?? "";
  return {
    expert: team ? (teamRef || (view.expert ?? "")) : (view.expert ?? ""),
    model: view.model ?? "",
    team,
    teamName: "",
    skills: view.skills,
    connectorIds: view.connector_ids,
    mode: (["default", "plan", "ask"].includes(view.mode) ? view.mode : "default") as ConfigMode,
    labels: {},
  };
}

/** 两份配置是否一样（忽略只用来显示的名字）。 */
export function sameDraft(a: ConfigDraft, b: ConfigDraft): boolean {
  const same = (x: string[] | null, y: string[] | null) => (x === null || y === null ? x === y : x.length === y.length && x.every((item, i) => item === y[i]));
  return a.expert === b.expert && a.model === b.model && a.mode === b.mode && same(a.skills, b.skills) && same(a.connectorIds, b.connectorIds);
}
