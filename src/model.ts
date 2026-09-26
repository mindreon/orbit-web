export type Role = "经办人" | "合规" | "财务";
export type PermissionPreset = "read-only" | "workspace-write" | "danger-full-access";
export type RoomState = "idle" | "running" | "awaiting_approval" | "closed";
export type FilterId = "进行中" | "待我确认" | "已完成";

export interface Agent {
  id: string;
  name: string;
  duty: string;
}
export interface KbDoc {
  id: string;
  title: string;
  body: string;
}
export interface KnowledgeBase {
  id: string;
  name: string;
  docs: KbDoc[];
}
export interface ExternalSource {
  id: string;
  name: string;
  origin: string;
  excerpt: string;
}
export interface McpTool {
  id: string;
  name: string;
  purpose: string;
  connected: boolean;
}
export interface SkillStep {
  id: string;
  name: string;
  agentIds: string[];
  kbDocIds: string[];
  externalIds: string[];
  mcpIds: string[];
  needsConfirm: boolean;
}
export interface Skill {
  id: string;
  name: string;
  steps: SkillStep[];
}
export function permissionLabel(preset: PermissionPreset) {
  if (preset === "read-only") return "云端只读";
  if (preset === "workspace-write") return "云端可写";
  return "完全访问";
}

export function stateLabel(state: RoomState) {
  if (state === "awaiting_approval") return "待我确认";
  if (state === "closed") return "已完成";
  if (state === "idle") return "未开始";
  return "进行中";
}

export interface Matter {
  id: string;
  title: string;
  permission: PermissionPreset;
  state: RoomState;
  createdAt: string;
  skillId: string;
  kbDocId: string;
  externalId: string;
  mcpIds: string[];
  pinned?: boolean;
  /** From orbit-control room payload when `modelMode` is present. */
  modelMode?: string;
}

export interface Catalog {
  agents: Agent[];
  skills: Skill[];
  bases: KnowledgeBase[];
  externals: ExternalSource[];
  mcps: McpTool[];
}

export const ROLES: Role[] = ["经办人", "合规", "财务"];
export const FILTERS: FilterId[] = ["进行中", "待我确认", "已完成"];

export function seedCatalog(): Catalog {
  return {
    agents: [
      {
        id: "coordinator",
        name: "经办助手",
        duty: "接住员工的话，按准入步骤交办，并起草说明。",
      },
      {
        id: "policy",
        name: "制度核查",
        duty: "对照自建制度和外部资料，指出资质缺口。",
      },
      {
        id: "registry",
        name: "工商查询",
        duty: "通过工商 MCP 拉取登记信息。",
      },
    ],
    skills: [
      {
        id: "onboarding",
        name: "供应商准入",
        steps: [
          {
            id: "collect",
            name: "收集资料",
            agentIds: ["policy", "registry"],
            kbDocIds: ["license-rule"],
            externalIds: ["group-check"],
            mcpIds: ["mcp-registry"],
            needsConfirm: false,
          },
          {
            id: "draft",
            name: "起草准入说明",
            agentIds: ["coordinator"],
            kbDocIds: [],
            externalIds: [],
            mcpIds: [],
            needsConfirm: false,
          },
          {
            id: "submit",
            name: "提交合规审核",
            agentIds: ["coordinator"],
            kbDocIds: [],
            externalIds: [],
            mcpIds: ["mcp-approval"],
            needsConfirm: true,
          },
          {
            id: "compliance",
            name: "合规确认",
            agentIds: [],
            kbDocIds: [],
            externalIds: [],
            mcpIds: [],
            needsConfirm: true,
          },
          {
            id: "finance",
            name: "财务确认",
            agentIds: [],
            kbDocIds: [],
            externalIds: [],
            mcpIds: ["mcp-notify"],
            needsConfirm: true,
          },
        ],
      },
      {
        id: "general",
        name: "通用问询",
        steps: [
          {
            id: "ask",
            name: "回答问题",
            agentIds: ["coordinator"],
            kbDocIds: [],
            externalIds: [],
            mcpIds: [],
            needsConfirm: false,
          },
        ],
      },
    ],
    bases: [
      {
        id: "supplier-policy",
        name: "供应商管理制度",
        docs: [
          {
            id: "license-rule",
            title: "新供应商准入条件",
            body: "新供应商入库前须提供有效的安全生产许可证。未能提供者不得进入合格名录。许可证主体须与营业执照一致。",
          },
          {
            id: "name-list",
            title: "合格供应商名录说明",
            body: "名录每年复核一次。新准入通过财务确认后，由采购群收到通知再入库。",
          },
        ],
      },
    ],
    externals: [
      {
        id: "group-check",
        name: "集团资质核验",
        origin: "集团制度站",
        excerpt:
          "生产型供应商的安全生产许可证须在有效期内，并与营业执照主体一致。",
      },
      {
        id: "public-case",
        name: "公开裁决定摘录",
        origin: "公开网页",
        excerpt: "仅作对照，不作为本次准入的必要依据。",
      },
    ],
    mcps: [
      {
        id: "mcp-registry",
        name: "工商查询",
        purpose: "读取企业登记与公示许可",
        connected: true,
      },
      {
        id: "mcp-approval",
        name: "提交审批",
        purpose: "把准入材料提交到合规流程",
        connected: true,
      },
      {
        id: "mcp-notify",
        name: "发送通知",
        purpose: "向采购群发送入库通知",
        connected: true,
      },
      {
        id: "mcp-calendar",
        name: "日历",
        purpose: "创建补交材料的截止日期",
        connected: false,
      },
    ],
  };
}

export function defaultEquipment() {
  return {
    skillId: "onboarding",
    kbDocId: "license-rule",
    externalId: "group-check",
    mcpIds: ["mcp-registry", "mcp-approval", "mcp-notify"],
  };
}

export function matterTitle(matter: Matter) {
  return matter.title.trim() || "未命名事项";
}

export function findAgent(catalog: Catalog, id: string) {
  return catalog.agents.find((item) => item.id === id);
}

export function findDoc(catalog: Catalog, id: string) {
  for (const base of catalog.bases) {
    const doc = base.docs.find((item) => item.id === id);
    if (doc) return { base, doc };
  }
  return undefined;
}

