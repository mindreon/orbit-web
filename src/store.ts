import { create } from "zustand";
import {
  abortRoom,
  createRoom,
  decideApproval,
  getRoom,
  listActivity,
  listApprovals,
  listMessages,
  listRooms,
  postMessage,
  steerRoom,
  type ActivityEvent,
  type Approval,
  type ChatMessage,
  type Room,
} from "./lib/rooms";
import { isMockRoom, MOCK_MATTERS, mockActivity, mockApproval, mockMessages } from "./lib/mockRooms";
import {
  defaultEquipment,
  seedCatalog,
  type Catalog,
  type ExternalSource,
  type FilterId,
  type KnowledgeBase,
  type Matter,
  type McpTool,
  type PermissionPreset,
  type Role,
  type Skill,
} from "./model";

interface MindState {
  role: Role;
  filter: FilterId;
  catalog: Catalog;
  matters: Matter[];
  messages: Record<string, ChatMessage[]>;
  activity: Record<string, ActivityEvent[]>;
  approvals: Record<string, Approval | null>;
  /** 这间房间刚点过停止，下一句走转向。 */
  steered: Record<string, boolean>;
  activeId: string | null;
  hiddenIds: string[];
  composing: boolean;
  loading: boolean;
  pending: "create" | "send" | "abort" | "steer" | "decide" | null;
  error: string | null;
  threadAgentId: string | null;
  reading: "kb" | "external" | "mcp" | null;
  catalogTab: "agent" | "skill" | "kb" | "external" | "mcp";
  selectedCatalogId: string;
  setRole: (role: Role) => void;
  setFilter: (filter: FilterId) => void;
  selectMatter: (id: string) => void;
  setThread: (agentId: string | null) => void;
  setReading: (reading: MindState["reading"]) => void;
  loadRooms: () => Promise<void>;
  loadMessages: (id: string) => Promise<void>;
  loadActivity: (id: string) => Promise<void>;
  loadApproval: (id: string) => Promise<void>;
  loadRoomDetail: (id: string) => Promise<void>;
  createMatter: (text: string, permission: PermissionPreset) => Promise<void>;
  startBlank: () => void;
  renameMatter: (id: string, title: string) => void;
  archiveMatter: (id: string) => void;
  unarchiveMatter: (id: string) => void;
  removeMatter: (id: string) => void;
  pinMatter: (id: string, pinned: boolean) => void;
  send: (text: string) => Promise<void>;
  rewindTo: (messageId: string) => void;
  replayFrom: (messageId: string) => void;
  stop: () => Promise<void>;
  steer: (text: string) => Promise<void>;
  decide: (approvalId: string, decision: "allow" | "reject") => Promise<void>;
  swap: (patch: Partial<Pick<Matter, "skillId" | "kbDocId" | "externalId">> & { mcpId?: string; slot?: string }) => void;
  setCatalogTab: (tab: MindState["catalogTab"], id?: string) => void;
  updateAgent: (id: string, patch: { name?: string; duty?: string }) => void;
  updateSkill: (skill: Skill) => void;
  updateBase: (base: KnowledgeBase) => void;
  updateExternal: (source: ExternalSource) => void;
  updateMcp: (tool: McpTool) => void;
}

function roomToMatter(room: Room, previous?: Matter): Matter {
  return {
    ...(previous ?? defaultEquipment()),
    id: room.id,
    title: room.title.trim() || "未命名事项",
    permission: room.permissionPreset,
    state: room.state,
    createdAt: room.createdAt,
  };
}

function patchActive(matters: Matter[], activeId: string | null, recipe: (matter: Matter) => Matter) {
  if (!activeId) return matters;
  return matters.map((matter) => (matter.id === activeId ? recipe(matter) : matter));
}

export const useMind = create<MindState>((set, get) => ({
  role: "经办人",
  filter: "进行中",
  catalog: seedCatalog(),
  matters: [],
  hiddenIds: [],
  messages: {},
  activity: {},
  approvals: {},
  steered: {},
  activeId: null,
  composing: false,
  loading: false,
  pending: null,
  error: null,
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
  selectMatter: (id) => {
    set({ activeId: id, composing: false, threadAgentId: null, reading: null, error: null });
    void get().loadRoomDetail(id);
  },
  startBlank: () => set({ activeId: null, composing: true, threadAgentId: null, reading: null, error: null }),
  renameMatter: (id, title) => {
    const next = title.trim();
    if (!next) return;
    set({ matters: get().matters.map((matter) => (matter.id === id ? { ...matter, title: next } : matter)) });
  },
  archiveMatter: (id) => {
    set({
      matters: get().matters.map((matter) => (matter.id === id && matter.state !== "running" ? { ...matter, state: "closed" } : matter)),
      activeId: get().activeId === id ? null : get().activeId,
    });
  },
  unarchiveMatter: (id) => {
    set({
      matters: get().matters.map((matter) => (matter.id === id && matter.state === "closed" ? { ...matter, state: "idle" } : matter)),
    });
  },
  removeMatter: (id) => {
    set({
      matters: get().matters.filter((matter) => matter.id !== id),
      hiddenIds: get().hiddenIds.includes(id) ? get().hiddenIds : [...get().hiddenIds, id],
      activeId: get().activeId === id ? null : get().activeId,
    });
  },
  pinMatter: (id, pinned) => {
    set({ matters: get().matters.map((matter) => (matter.id === id ? { ...matter, pinned } : matter)) });
  },
  setThread: (agentId) => set({ threadAgentId: agentId, reading: null }),
  setReading: (reading) => set({ reading }),
  loadRooms: async () => {
    set({ loading: true, error: null });
    try {
      const body = await listRooms();
      const previous = new Map(get().matters.map((matter) => [matter.id, matter]));
      const matters = (body.items ?? [])
        .map((room) => roomToMatter(room, previous.get(room.id)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { activeId, composing } = get();
      const stillThere = activeId !== null && matters.some((matter) => matter.id === activeId);
      const nextId = composing ? null : stillThere ? activeId : (matters[0]?.id ?? null);
      set({ matters, activeId: nextId, loading: false });
      if (nextId) await get().loadRoomDetail(nextId);
    } catch {
      const previous = new Map(get().matters.map((matter) => [matter.id, matter]));
      const hidden = new Set(get().hiddenIds);
      const seeded = MOCK_MATTERS.filter((matter) => !hidden.has(matter.id)).map((matter) => previous.get(matter.id) ?? matter);
      const extras = get().matters.filter((matter) => isMockRoom(matter.id) && !seeded.some((item) => item.id === matter.id));
      set({ matters: [...extras, ...seeded], loading: false, error: null });
    }
  },
  loadMessages: async (id) => {
    if (isMockRoom(id)) {
      set({ messages: { ...get().messages, [id]: get().messages[id] ?? mockMessages(id) } });
      return;
    }
    try {
      const body = await listMessages(id);
      if (get().activeId !== id && !get().matters.some((matter) => matter.id === id)) return;
      const items = [...(body.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      set({ messages: { ...get().messages, [id]: items } });
    } catch (error) {
      if (get().activeId === id) {
        set({ error: error instanceof Error ? error.message : "消息读取失败" });
      }
    }
  },
  loadRoomDetail: async (id) => {
    await Promise.all([get().loadMessages(id), get().loadActivity(id), get().loadApproval(id)]);
  },
  loadActivity: async (id) => {
    if (isMockRoom(id)) {
      set({ activity: { ...get().activity, [id]: get().activity[id] ?? mockActivity(id) } });
      return;
    }
    try {
      const body = await listActivity(id);
      const items = [...(body.items ?? [])].sort((a, b) => a.sequence - b.sequence);
      set({ activity: { ...get().activity, [id]: items } });
    } catch (error) {
      if (get().activeId === id) {
        set({ error: error instanceof Error ? error.message : "活动读取失败" });
      }
    }
  },
  loadApproval: async (id) => {
    if (isMockRoom(id)) {
      const current = get().approvals[id];
      set({ approvals: { ...get().approvals, [id]: current === undefined ? mockApproval(id) : current } });
      return;
    }
    try {
      const body = await listApprovals();
      const pending = (body.items ?? [])
        .filter((item) => item.roomId === id && item.status === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      set({ approvals: { ...get().approvals, [id]: pending ?? null } });
    } catch (error) {
      if (get().activeId === id) {
        set({ error: error instanceof Error ? error.message : "批准读取失败" });
      }
    }
  },
  createMatter: async (text, permission) => {
    const title = text.trim();
    if (!title || get().pending) return;
    set({ pending: "create", error: null });
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    try {
      const room = await createRoom({ title, permissionPreset: permission });
      const matter = roomToMatter(room);
      set({
        matters: [matter, ...get().matters.filter((item) => item.id !== matter.id)],
        messages: { ...get().messages, [matter.id]: [] },
        activity: { ...get().activity, [matter.id]: [] },
        approvals: { ...get().approvals, [matter.id]: null },
        activeId: matter.id,
        composing: false,
        filter: "进行中",
        pending: null,
        error: null,
        threadAgentId: null,
        reading: null,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message.trim() : "";
      set({
        pending: null,
        error: detail ? `创建任务失败：${detail}` : "创建任务失败",
      });
    }
  },
  send: async (text) => {
    const trimmed = text.trim();
    const id = get().activeId;
    if (!trimmed || !id || get().pending) return;
    set({ pending: "send", error: null });
    try {
      const posted = await postMessage(id, trimmed);
      set({
        matters: get().matters.map((matter) => (matter.id === posted.room.id ? roomToMatter(posted.room, matter) : matter)),
        approvals: { ...get().approvals, [id]: posted.approval?.status === "pending" ? posted.approval : null },
        pending: null,
      });
      await get().loadRoomDetail(id);
    } catch {
      if (!isMockRoom(id)) {
        set({ pending: null, error: "发送失败" });
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      const now = new Date().toISOString();
      const prior = get().messages[id] ?? [];
      set({
        messages: {
          ...get().messages,
          [id]: [
            ...prior,
            { id: `${id}-u-${prior.length}`, roomId: id, role: "user", text: trimmed, createdAt: now },
            {
              id: `${id}-a-${prior.length}`,
              roomId: id,
              role: "assistant",
              text: "已记下。这一句只留在这件云端任务里。",
              createdAt: now,
            },
          ],
        },
        pending: null,
        error: null,
      });
    }
  },
  rewindTo: (messageId) => {
    const id = get().activeId;
    if (!id || !isMockRoom(id)) return;
    const list = get().messages[id] ?? [];
    const index = list.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    set({ messages: { ...get().messages, [id]: list.slice(0, index + 1) } });
  },
  replayFrom: (messageId) => {
    const id = get().activeId;
    if (!id || !isMockRoom(id)) return;
    const list = get().messages[id] ?? [];
    const index = list.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    const now = new Date().toISOString();
    set({
      messages: {
        ...get().messages,
        [id]: [
          ...list.slice(0, index + 1),
          {
            id: `${id}-replay-${Date.now()}`,
            roomId: id,
            role: "assistant",
            text: "已记下。这一句只留在这件云端任务里。",
            createdAt: now,
          },
        ],
      },
    });
  },
  stop: async () => {
    const id = get().activeId;
    if (!id || get().pending === "abort") return;
    set({ pending: "abort", error: null });
    try {
      await abortRoom(id);
      const room = await getRoom(id);
      set({
        matters: get().matters.map((matter) => (matter.id === room.id ? roomToMatter(room, matter) : matter)),
        steered: { ...get().steered, [id]: true },
        pending: null,
      });
      await get().loadRoomDetail(id);
    } catch (error) {
      set({ pending: null, error: error instanceof Error ? error.message : "停止失败" });
    }
  },
  steer: async (text) => {
    const trimmed = text.trim();
    const id = get().activeId;
    if (!trimmed || !id || get().pending) return;
    set({ pending: "steer", error: null });
    try {
      await steerRoom(id, trimmed);
      set({ pending: null });
      await get().loadRoomDetail(id);
    } catch (error) {
      set({ pending: null, error: error instanceof Error ? error.message : "接着说失败" });
      await get().loadRoomDetail(id);
    }
  },
  decide: async (approvalId, decision) => {
    const id = get().activeId;
    if (!id || get().pending) return;
    if (isMockRoom(id)) {
      const now = new Date().toISOString();
      const prior = get().messages[id] ?? [];
      const allowed = decision === "allow";
      set({
        matters: get().matters.map((matter) => (matter.id === id ? { ...matter, state: allowed ? "idle" : "idle" } : matter)),
        approvals: { ...get().approvals, [id]: null },
        messages: {
          ...get().messages,
          [id]: [
            ...prior,
            {
              id: `${id}-d-${prior.length}`,
              roomId: id,
              role: "assistant",
              text: allowed ? "已允许这一次。提交审批记在这件云端任务里。" : "已拒绝。这一次不会提交。",
              createdAt: now,
            },
          ],
        },
        activity: {
          ...get().activity,
          [id]: [
            ...(get().activity[id] ?? []),
            {
              id: `${id}-act-${prior.length}`,
              sequence: (get().activity[id]?.length ?? 0) + 1,
              type: allowed ? "tool.result" : "approval.asked",
              roomId: id,
              toolName: "提交审批",
              text: allowed ? "已允许" : "已拒绝",
              occurredAt: now,
            },
          ],
        },
        pending: null,
        error: null,
      });
      return;
    }
    set({ pending: "decide", error: null });
    try {
      await decideApproval(approvalId, decision);
      const room = await getRoom(id);
      set({
        matters: get().matters.map((matter) => (matter.id === room.id ? roomToMatter(room, matter) : matter)),
        pending: null,
      });
      await get().loadRoomDetail(id);
    } catch (error) {
      set({ pending: null, error: error instanceof Error ? error.message : "批准失败" });
      if (id) await get().loadRoomDetail(id);
    }
  },
  swap: (patch) => {
    if (get().role !== "经办人") return;
    set({
      matters: patchActive(get().matters, get().activeId, (matter) => {
        if (matter.state === "closed") return matter;
        const mcpIds = patch.mcpId
          ? matter.mcpIds.map((id) => (id === patch.slot ? patch.mcpId! : id))
          : matter.mcpIds;
        return {
          ...matter,
          skillId: patch.skillId ?? matter.skillId,
          kbDocId: patch.kbDocId ?? matter.kbDocId,
          externalId: patch.externalId ?? matter.externalId,
          mcpIds,
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
