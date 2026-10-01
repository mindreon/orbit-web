import { api } from "./api";

/** 专家：一个版本一行不可变的 profile。任务引用的是 `ref`（「<id>@<版本>」）。 */
export type Expert = {
  expert_id: string;
  ref: string;
  version: number;
  name: string;
  instructions: string;
  model: string;
  connector_ids: string[];
  skill_ids: string[];
  created_at: string;
};

export type ExpertInput = {
  name: string;
  instructions?: string;
  model?: string;
  connector_ids?: string[];
  skill_ids?: string[];
};

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
