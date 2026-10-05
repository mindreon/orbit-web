import { api } from "./api";

/** 专家团的一名成员：角色 ID（`role`，ASCII，给程序用），人看到的显示名 `label`，和这个角色用哪一位（固定版本的）单人专家。`name` 是那个版本的专家名。 */
export type TeamMember = { role: string; expert: string; name: string; description?: string; /** 人看到的名字（≤40 字）；旧的专家团没有。 */ label?: string };

/** 专家：一个版本一行不可变的 profile。任务引用的是 `ref`（「<id>@<版本>」）。`kind` 缺省（旧数据）就是单人专家。 */
export type Expert = {
  expert_id: string;
  kind?: "expert" | "team";
  ref: string;
  version: number;
  name: string;
  instructions: string;
  model: string;
  connector_ids: string[];
  skill_ids: string[];
  created_at: string;
  /** 专家团才有：领队的角色名，和成员。 */
  leader?: string;
  members?: TeamMember[];
};

export type TeamMemberInput = { role: string; expert: string; description?: string; label?: string };

export type ExpertInput = {
  name: string;
  instructions?: string;
  model?: string;
  connector_ids?: string[];
  skill_ids?: string[];
  /** 专家团：自己没有指令、模型、连接器和技能（后端会拒绝），这些在成员专家里。 */
  kind?: "expert" | "team";
  leader?: string;
  members?: TeamMemberInput[];
};

export const isTeam = (expert: Pick<Expert, "kind">): boolean => expert.kind === "team";

/** 单人专家：可以当成员、可以指派给某一步。专家团不能（后端拒绝团队嵌套，也不能当节点的专家）。 */
export const singleExperts = <T extends Pick<Expert, "kind">>(experts: readonly T[]): T[] => experts.filter((expert) => !isTeam(expert));

export async function listExperts(): Promise<Expert[]> {
  const body = await api<{ items: Expert[] | null }>("/v1/experts");
  return body.items ?? [];
}

export function createExpert(input: ExpertInput): Promise<Expert> {
  return api<Expert>("/v1/experts", { method: "POST", body: JSON.stringify(input) });
}

/** 整体替换，产生下一个版本；旧版本不变。 */
export function updateExpert(expertId: string, input: ExpertInput): Promise<Expert> {
  return api<Expert>(`/v1/experts/${encodeURIComponent(expertId)}`, { method: "PUT", body: JSON.stringify(input) });
}

/** 目录智能体里它用到、而你这里没有的技能和连接器（按名字精确匹配，不猜）。 */
export type UnmatchedRefs = { skills: string[]; connectors: string[] };

/** 把目录里的智能体变成自己的专家：提示词成为指令，名字能对上的技能和连接器自动选中。 */
export function expertFromAgent(handle: string, slug: string): Promise<{ expert: Expert; unmatched: UnmatchedRefs }> {
  return api("/v1/experts/from-agent", { method: "POST", body: JSON.stringify({ handle, slug }) });
}
