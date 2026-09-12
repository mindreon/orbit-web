import type { ActivityEvent } from "@/lib/control";

export type ComposerMode = "execute" | "plan" | "ask" | "steer";

export type DrawerTab = "activity" | "roster";

export type PersonaOption = {
  id: string;
  name: string;
  summary: string;
};

/** Frontend-only personas until Agents API lands. */
export const DEFAULT_PERSONAS: PersonaOption[] = [
  { id: "orbit-default", name: "Orbit", summary: "默认企业执行人格" },
  { id: "analyst", name: "分析助手", summary: "偏调研与归纳" },
  { id: "builder", name: "工程助手", summary: "偏改代码与落地" },
];

export type RosterMember = {
  id: string;
  name: string;
  role: "lead" | "child";
  status: "idle" | "running" | "done";
  personaId: string;
  personaName: string;
  inherited: boolean;
};

/** Ask / Plan frontend convention prefixes (real mode field later). */
export function wrapMessageForMode(mode: ComposerMode, text: string): string {
  const trimmed = text.trim();
  if (mode === "ask") {
    return `【仅问答】只回答问题，不要改文件、不要调用写工具。\n\n${trimmed}`;
  }
  if (mode === "plan") {
    return `【先计划】请只输出可执行计划，等待我确认后再动手。不要修改文件或执行写操作。\n\n${trimmed}`;
  }
  return trimmed;
}

export function planConfirmMessage(planText: string): string {
  return `【按计划执行】请按以下计划执行：\n\n${planText}`;
}

export function activityLabel(item: ActivityEvent): string {
  switch (item.type) {
    case "session.status":
      return `会话状态：${item.status ?? "已更新"}`;
    case "tool.call":
      return `调用工具：${item.toolName ?? "tool"}`;
    case "tool.result":
      return `工具结果：${item.toolName ?? item.callId ?? "tool"}`;
    case "approval.asked":
      return `等待审批：${item.toolName ?? "tool"}`;
    case "agent.started":
      return "子 Agent 已启动";
    case "agent.finished":
      return "子 Agent 已完成";
    case "usage":
      return "用量已更新";
    case "room.steered":
      return `调整方向：${item.text ?? ""}`;
    default:
      return item.role === "user" ? "已提交任务消息" : "Agent 输出";
  }
}

/** Observe-only roster; children inherit lead persona unless overridden. */
export function buildRoster(args: {
  kind: "solo" | "collab";
  activity: ActivityEvent[];
  leadPersona: PersonaOption;
  childOverrides?: Record<string, string>;
}): RosterMember[] {
  const { kind, activity, leadPersona, childOverrides = {} } = args;
  const lead: RosterMember = {
    id: "lead",
    name: "主 Agent",
    role: "lead",
    status: "running",
    personaId: leadPersona.id,
    personaName: leadPersona.name,
    inherited: false,
  };
  if (kind !== "collab") return [lead];

  const children = new Map<string, RosterMember>();
  let childIndex = 0;
  for (const event of activity) {
    if (event.type !== "agent.started" && event.type !== "agent.finished") continue;
    childIndex += 1;
    const id = event.callId || event.turnId || `child-${childIndex}`;
    const overridePersona = DEFAULT_PERSONAS.find((p) => p.id === childOverrides[id]);
    const inherited = !overridePersona;
    const persona = overridePersona ?? leadPersona;
    const prev = children.get(id);
    children.set(id, {
      id,
      name: prev?.name ?? `子 Agent ${children.size + (prev ? 0 : 1)}`,
      role: "child",
      status: event.type === "agent.finished" ? "done" : "running",
      personaId: persona.id,
      personaName: persona.name,
      inherited,
    });
  }
  if (children.size === 0) {
    children.set("child-preview", {
      id: "child-preview",
      name: "子 Agent（待委派）",
      role: "child",
      status: "idle",
      personaId: leadPersona.id,
      personaName: leadPersona.name,
      inherited: true,
    });
  }
  return [lead, ...children.values()];
}
