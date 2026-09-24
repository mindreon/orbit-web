import { create } from "zustand";
import {
  defaultEquipment,
  needsRole,
  seedCatalog,
  seedMatter,
  type Catalog,
  type ExternalSource,
  type FilterId,
  type KnowledgeBase,
  type Matter,
  type McpTool,
  type PermissionPreset,
  type Role,
  type Skill,
  type Status,
} from "./model";

interface MindState {
  role: Role;
  filter: FilterId;
  catalog: Catalog;
  matters: Matter[];
  activeId: string | null;
  threadAgentId: string | null;
  reading: "kb" | "external" | "mcp" | null;
  catalogTab: "agent" | "skill" | "kb" | "external" | "mcp";
  selectedCatalogId: string;
  setRole: (role: Role) => void;
  setFilter: (filter: FilterId) => void;
  selectMatter: (id: string) => void;
  setThread: (agentId: string | null) => void;
  setReading: (reading: MindState["reading"]) => void;
  jump: (status: Status) => void;
  createMatter: (text: string, permission: PermissionPreset) => void;
  startBlank: () => void;
  skipOpening: () => void;
  advanceOpening: () => void;
  decide: (pass: boolean, reason: string) => void;
  send: (text: string) => void;
  swap: (patch: Partial<Pick<Matter, "skillId" | "kbDocId" | "externalId">> & { mcpId?: string; slot?: string }) => void;
  setCatalogTab: (tab: MindState["catalogTab"], id?: string) => void;
  updateAgent: (id: string, patch: { name?: string; duty?: string }) => void;
  updateSkill: (skill: Skill) => void;
  updateBase: (base: KnowledgeBase) => void;
  updateExternal: (source: ExternalSource) => void;
  updateMcp: (tool: McpTool) => void;
}

function patchActive(matters: Matter[], activeId: string | null, recipe: (matter: Matter) => Matter) {
  if (!activeId) return matters;
  return matters.map((matter) => (matter.id === activeId ? recipe(matter) : matter));
}

export const useMind = create<MindState>((set, get) => ({
  role: "经办人",
  filter: "进行中",
  catalog: seedCatalog(),
  matters: [seedMatter()],
  activeId: "huabei",
  threadAgentId: null,
  reading: null,
  catalogTab: "skill",
  selectedCatalogId: "onboarding",
  setRole: (role) =>
    set({
      role,
      filter: role === "经办人" ? "进行中" : "待我确认",
      threadAgentId: null,
    }),
  setFilter: (filter) => set({ filter }),
  selectMatter: (id) => set({ activeId: id, threadAgentId: null, reading: null }),
  startBlank: () => set({ activeId: null, threadAgentId: null, reading: null }),
  setThread: (agentId) => set({ threadAgentId: agentId, reading: null }),
  setReading: (reading) => set({ reading }),
  jump: (status) => {
    const viaReject = status === "驳回待补材料" || status === "待财务确认" || status === "已完成";
    set({
      activeId: "huabei",
      threadAgentId: null,
      reading: null,
      matters: get().matters.map((matter) =>
        matter.id === "huabei"
          ? {
              ...matter,
              status,
              viaReject,
              rich: true,
              openingPhase: null,
              extras: [],
              rejectReason: "缺少安全生产许可证",
            }
          : matter,
      ),
    });
  },
  createMatter: (text, permission) => {
    const matched = text.match(/给(.+?)办/);
    const supplier = (matched?.[1] ?? text).trim() || "新供应商";
    const existing = get().matters.find((matter) => matter.supplier === supplier && matter.scripted);
    if (existing) {
      set({ activeId: existing.id, threadAgentId: null, reading: null });
      return;
    }
    const id = `m-${Date.now()}`;
    const matter: Matter = {
      id,
      supplier,
      scripted: false,
      permission,
      status: "办理中",
      viaReject: false,
      rejectReason: "",
      rich: false,
      openingPhase: 0,
      extras: [],
      ...defaultEquipment(),
    };
    set({
      matters: [matter, ...get().matters],
      activeId: id,
      threadAgentId: null,
      reading: null,
      filter: "进行中",
    });
  },
  skipOpening: () =>
    set({
      matters: patchActive(get().matters, get().activeId, (matter) => ({
        ...matter,
        openingPhase: null,
        rich: false,
        status: "办理中",
      })),
    }),
  advanceOpening: () =>
    set({
      matters: patchActive(get().matters, get().activeId, (matter) => {
        if (matter.openingPhase === null) return matter;
        if (matter.openingPhase >= 2) return { ...matter, openingPhase: null };
        return { ...matter, openingPhase: matter.openingPhase + 1 };
      }),
    }),
  decide: (pass, reason) => {
    const { matters, activeId, role } = get();
    const current = matters.find((matter) => matter.id === activeId);
    if (!current || !needsRole(current, role)) return;
    if (current.permission === "read-only" && pass) return;
    set({
      matters: patchActive(matters, activeId, (matter) => {
        if (matter.status === "办理中") return { ...matter, status: "待合规确认" };
        if (matter.status === "待合规确认" && pass) {
          return { ...matter, status: "待财务确认", viaReject: false };
        }
        if (matter.status === "待合规确认" && !pass) {
          return {
            ...matter,
            status: "驳回待补材料",
            viaReject: true,
            rejectReason: reason.trim() || "缺少安全生产许可证",
          };
        }
        if (matter.status === "驳回待补材料") return { ...matter, status: "待财务确认" };
        if (matter.status === "待财务确认" && pass) return { ...matter, status: "已完成" };
        if (matter.status === "待财务确认" && !pass) {
          return {
            ...matter,
            status: "驳回待补材料",
            viaReject: true,
            rejectReason: reason.trim() || "财务未通过",
          };
        }
        return matter;
      }),
    });
  },
  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { catalog, threadAgentId } = get();
    const mentioned = catalog.agents.find((agent) => trimmed.includes(`@${agent.name}`));
    const agentId = mentioned?.id ?? threadAgentId ?? undefined;
    const clean = trimmed.replace(/@\S+\s*/g, "").trim() || trimmed;
    set({
      matters: patchActive(get().matters, get().activeId, (matter) => ({
        ...matter,
        extras: [
          ...matter.extras,
          { id: `x-${Date.now()}`, author: "human", text: clean, agentId },
        ],
      })),
    });
  },
  swap: (patch) => {
    if (get().role !== "经办人") return;
    set({
      matters: patchActive(get().matters, get().activeId, (matter) => {
        if (matter.status === "已完成") return matter;
        const mcpIds = patch.mcpId
          ? matter.mcpIds.map((id) => (id === patch.slot ? patch.mcpId! : id))
          : matter.mcpIds;
        const note = patch.skillId
          ? "已更换 Skill"
          : patch.kbDocId
            ? "已更换自建制度"
            : patch.externalId
              ? "已更换外部来源"
              : "已更换 MCP";
        return {
          ...matter,
          skillId: patch.skillId ?? matter.skillId,
          kbDocId: patch.kbDocId ?? matter.kbDocId,
          externalId: patch.externalId ?? matter.externalId,
          mcpIds,
          extras: [
            ...matter.extras,
            { id: `s-${Date.now()}`, author: "human", text: note },
          ],
        };
      }),
    });
  },
  setCatalogTab: (tab, id) => set({ catalogTab: tab, selectedCatalogId: id ?? get().selectedCatalogId }),
  updateAgent: (id, patch) =>
    set({
      catalog: {
        ...get().catalog,
        agents: get().catalog.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
      },
    }),
  updateSkill: (skill) =>
    set({
      catalog: {
        ...get().catalog,
        skills: get().catalog.skills.map((item) => (item.id === skill.id ? skill : item)),
      },
    }),
  updateBase: (base) =>
    set({
      catalog: {
        ...get().catalog,
        bases: get().catalog.bases.map((item) => (item.id === base.id ? base : item)),
      },
    }),
  updateExternal: (source) =>
    set({
      catalog: {
        ...get().catalog,
        externals: get().catalog.externals.map((item) => (item.id === source.id ? source : item)),
      },
    }),
  updateMcp: (tool) =>
    set({
      catalog: {
        ...get().catalog,
        mcps: get().catalog.mcps.map((item) => (item.id === tool.id ? tool : item)),
      },
    }),
}));
