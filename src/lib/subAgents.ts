import { mainChat, type ChatItem, type ChatTeam, type MemberStatus } from "./chat";

/** 右侧「子智能体」里的一位：团队成员和它眼下的状态、最近一次动静的时间。 */
export interface SubAgent {
  readonly role: string;
  readonly label: string;
  readonly name: string;
  readonly description: string;
  readonly status: MemberStatus;
  /** 这位成员最近一次发言或被派活的时间（ISO）；还没有时为空。 */
  readonly at: string;
}

type TeamWithDescriptions = {
  readonly leader: string;
  readonly members: ReadonlyArray<{ readonly role: string; readonly label?: string; readonly name?: string; readonly description?: string; readonly expert: string }>;
};

/** 进行中：在做或等着做；已结束：做完了或失败了。 */
export const isActive = (status: MemberStatus) => status === "running" || status === "waiting";

/**
 * 派过活的成员，按团队里的顺序。状态和主对话里的名册同源（`mainChat` 的 roster）：每一轮的名册各说各的，
 * 同一位成员以最近一轮为准；时间取这位成员最后一条消息（或最后一次被领队派活）。
 */
export function subAgents(chat: readonly ChatItem[], team: TeamWithDescriptions & ChatTeam): SubAgent[] {
  const status = new Map<string, MemberStatus>();
  for (const item of mainChat(chat, team)) {
    if (item.type === "roster") for (const member of item.members) status.set(member.role, member.status);
  }
  const latest = new Map<string, number>();
  const touch = (role: string, at: string | undefined) => {
    const time = Date.parse(at ?? "");
    if (Number.isFinite(time) && time > (latest.get(role) ?? 0)) latest.set(role, time);
  };
  for (const item of chat) {
    if (item.type !== "bubble") continue;
    if (item.kind === "assign") for (const role of item.to) touch(role, item.at);
    else touch(item.speaker.role, item.at);
  }
  return team.members
    .filter((member) => status.has(member.role))
    .map((member) => ({
      role: member.role,
      label: member.label ?? "",
      name: member.name ?? "",
      description: member.description ?? "",
      status: status.get(member.role)!,
      at: latest.has(member.role) ? new Date(latest.get(member.role)!).toISOString() : "",
    }));
}
