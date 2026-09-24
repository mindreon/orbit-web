export type Role = "经办人" | "合规" | "财务";
export type Status =
  | "办理中"
  | "待合规确认"
  | "驳回待补材料"
  | "待财务确认"
  | "已完成";
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
export interface ExtraMessage {
  id: string;
  author: "human";
  text: string;
  /** 这条插话属于哪个智能体的对话。主时间线也会显示。 */
  agentId?: string;
}
export interface Matter {
  id: string;
  supplier: string;
  scripted: boolean;
  status: Status;
  viaReject: boolean;
  rejectReason: string;
  /** 办理中是否已经写好草稿和提交卡。新建事项的开场结束时为 false。 */
  rich: boolean;
  /** 0 挂装备，1 制度，2 工商，null 表示开场结束。 */
  openingPhase: number | null;
  extras: ExtraMessage[];
  skillId: string;
  kbDocId: string;
  externalId: string;
  mcpIds: string[];
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
export const JUMPS: { id: Status; label: string }[] = [
  { id: "办理中", label: "办理中" },
  { id: "待合规确认", label: "待合规确认" },
  { id: "驳回待补材料", label: "驳回待补" },
  { id: "待财务确认", label: "待财务确认" },
  { id: "已完成", label: "已完成" },
];

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

export function seedMatter(): Matter {
  return {
    id: "huabei",
    supplier: "华北钢材",
    scripted: true,
    status: "办理中",
    viaReject: false,
    rejectReason: "缺少安全生产许可证",
    rich: true,
    openingPhase: null,
    extras: [],
    ...defaultEquipment(),
  };
}

export function matterTitle(matter: Matter) {
  return `${matter.supplier}供应商准入`;
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

export function needsRole(matter: Matter, role: Role): boolean {
  if (matter.openingPhase !== null) return false;
  if (matter.status === "办理中" && matter.rich) return role === "经办人";
  if (matter.status === "待合规确认") return role === "合规";
  if (matter.status === "驳回待补材料") return role === "经办人";
  if (matter.status === "待财务确认") return role === "财务";
  return false;
}

export function currentStepName(matter: Matter, catalog: Catalog) {
  const skill = catalog.skills.find((item) => item.id === matter.skillId);
  if (!skill) return "未开始";
  if (matter.openingPhase !== null) return skill.steps[0]?.name ?? "收集资料";
  if (!matter.rich && matter.status === "办理中") return skill.steps[0]?.name ?? "收集资料";
  if (matter.status === "办理中") return "提交合规审核";
  if (matter.status === "待合规确认") return "合规确认";
  if (matter.status === "驳回待补材料") return "补交材料";
  if (matter.status === "待财务确认") return "财务确认";
  return "已完成";
}

export interface FeedItem {
  id: string;
  who: string;
  text: string;
  agentId?: string;
  cite?: "kb" | "external" | "mcp";
}

export interface ConfirmView {
  actor: Role;
  action: string;
  conclusion: string;
  cites: Array<"kb" | "external" | "mcp">;
}

export function confirmOf(matter: Matter, catalog: Catalog): ConfirmView | null {
  if (matter.openingPhase !== null) return null;
  const doc = findDoc(catalog, matter.kbDocId)?.doc.title ?? "制度";
  if (matter.status === "办理中" && matter.rich) {
    return {
      actor: "经办人",
      action: "提交合规审核",
      conclusion: `草稿已写好。制度《${doc}》要求安全生产许可证，工商登记里未见该项。点通过后将调用「提交审批」。`,
      cites: ["kb", "external", "mcp"],
    };
  }
  if (matter.status === "待合规确认") {
    return {
      actor: "合规",
      action: "合规确认",
      conclusion: "经办人已提交。请核对制度与工商登记后决定是否通过。",
      cites: ["kb", "external", "mcp"],
    };
  }
  if (matter.status === "驳回待补材料") {
    return {
      actor: "经办人",
      action: "再次提交合规审核",
      conclusion: `驳回原因：${matter.rejectReason}。补交说明已起草，点通过后将再次调用「提交审批」。`,
      cites: ["kb"],
    };
  }
  if (matter.status === "待财务确认") {
    return {
      actor: "财务",
      action: "财务确认",
      conclusion: "通过后将调用「发送通知」，通知采购群。",
      cites: ["kb", "mcp"],
    };
  }
  return null;
}

export function feedOf(matter: Matter, catalog: Catalog): FeedItem[] {
  const policy = findAgent(catalog, "policy")?.name ?? "制度核查";
  const registry = findAgent(catalog, "registry")?.name ?? "工商查询";
  const lead = findAgent(catalog, "coordinator")?.name ?? "经办助手";
  const doc = findDoc(catalog, matter.kbDocId);
  const external = catalog.externals.find((item) => item.id === matter.externalId);
  const items: FeedItem[] = [];
  const phase = matter.openingPhase;

  if (phase === null || phase >= 1) {
    items.push({
      id: "equip",
      who: "系统",
      text: `已挂上 Skill、自建制度《${doc?.doc.title ?? ""}》和工商 MCP。`,
    });
  } else if (phase === 0) {
    items.push({ id: "equip-wait", who: "系统", text: "正在挂上这次要用的装备。" });
  }

  if (phase === null || phase >= 2) {
    items.push({
      id: "policy",
      who: policy,
      agentId: "policy",
      cite: "kb",
      text: `对照《${doc?.doc.title ?? "制度"}》和外部来源《${external?.name ?? "外部资料"}》：缺少安全生产许可证。`,
    });
  }
  if (phase === null || phase >= 3) {
    items.push({
      id: "registry",
      who: registry,
      agentId: "registry",
      cite: "mcp",
      text: `${matter.supplier}有限公司，统一社会信用代码 91130100MOCK88421，登记状态存续。公示许可中未见安全生产许可证。`,
    });
  }
  if (phase !== null) return items;

  if (matter.rich || matter.status !== "办理中") {
    items.push({
      id: "draft",
      who: lead,
      agentId: "coordinator",
      text: "准入说明已起草：主体存续，但缺安全生产许可证。建议连同这项缺口提交合规。",
    });
  }
  if (matter.status !== "办理中") {
    items.push({
      id: "submitted",
      who: "经办人",
      text: "已确认提交合规审核。",
    });
  }
  if (matter.viaReject && matter.status !== "待合规确认" && matter.status !== "办理中") {
    items.push({
      id: "rejected",
      who: "合规",
      text: `已驳回。原因：${matter.rejectReason}`,
    });
    items.push({
      id: "supplement",
      who: lead,
      agentId: "coordinator",
      text: `已按「${matter.rejectReason}」起草补交说明。`,
    });
  }
  if (
    matter.viaReject &&
    (matter.status === "待财务确认" || matter.status === "已完成")
  ) {
    items.push({ id: "resubmitted", who: "经办人", text: "已确认再次提交。" });
  }
  if (!matter.viaReject && (matter.status === "待财务确认" || matter.status === "已完成")) {
    items.push({ id: "compliance-pass", who: "合规", text: "合规已通过，进入财务确认。" });
  }
  if (matter.status === "已完成") {
    items.push({ id: "finance-pass", who: "财务", text: "财务已通过。" });
    items.push({
      id: "notified",
      who: "系统",
      text: "已调用「发送通知」，采购群已收到入库通知。事项完成。",
    });
  }

  for (const extra of matter.extras) {
    const agent = extra.agentId ? findAgent(catalog, extra.agentId) : undefined;
    items.push({
      id: extra.id,
      who: "经办人",
      agentId: extra.agentId,
      text: agent ? `@${agent.name} ${extra.text}` : extra.text,
    });
  }
  return items;
}
