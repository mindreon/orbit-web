import type { Matter } from "../model";
import type { ActivityEvent, Approval, ChatMessage } from "./rooms";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export const MOCK_MATTERS: Matter[] = [
  {
    id: "mock-slides",
    title: "制作泡泡玛特品牌介绍幻灯片",
    permission: "workspace-write",
    state: "idle",
    createdAt: daysAgo(11),
    skillId: "general",
    kbDocId: "license-rule",
    externalId: "group-check",
    mcpIds: [],
  },
  {
    id: "mock-summary",
    title: "阅读并总结 MindBuddy 文章",
    permission: "read-only",
    state: "idle",
    createdAt: daysAgo(13),
    skillId: "general",
    kbDocId: "license-rule",
    externalId: "group-check",
    mcpIds: [],
  },
  {
    id: "mock-approval",
    title: "起草供应商准入说明",
    permission: "workspace-write",
    state: "awaiting_approval",
    createdAt: daysAgo(1),
    skillId: "onboarding",
    kbDocId: "license-rule",
    externalId: "group-check",
    mcpIds: ["mcp-approval"],
  },
];

const messages: Record<string, ChatMessage[]> = {
  "mock-slides": [
    {
      id: "mock-slides-u",
      roomId: "mock-slides",
      role: "user",
      text: "帮我做一份泡泡玛特品牌介绍幻灯片，突出盲盒和会员。",
      createdAt: daysAgo(11),
    },
    {
      id: "mock-slides-a",
      roomId: "mock-slides",
      role: "assistant",
      text: "已在这件云端任务里起草 8 页大纲：品牌一句话、产品线、会员、门店。产物会放在云端空间，不写到你的电脑。",
      createdAt: daysAgo(11),
    },
  ],
  "mock-summary": [
    {
      id: "mock-summary-u",
      roomId: "mock-summary",
      role: "user",
      text: "阅读并总结 MindBuddy 的使用方式。",
      createdAt: daysAgo(13),
    },
    {
      id: "mock-summary-a",
      roomId: "mock-summary",
      role: "assistant",
      text: "它用左侧任务列表加中间对话。新建任务、助理、项目、专家技能连接器、定时任务和资料库是主导航。本地文件夹不参与，任务在云端跑。",
      createdAt: daysAgo(13),
    },
  ],
  "mock-approval": [
    {
      id: "mock-approval-u",
      roomId: "mock-approval",
      role: "user",
      text: "按供应商管理制度起草准入说明，并提交合规。",
      createdAt: daysAgo(1),
    },
    {
      id: "mock-approval-a",
      roomId: "mock-approval",
      role: "assistant",
      text: "草案已写好。提交审批前需要你确认这一次。",
      createdAt: daysAgo(1),
    },
  ],
};

const activity: Record<string, ActivityEvent[]> = {
  "mock-slides": [
    {
      id: "mock-slides-act",
      sequence: 1,
      type: "agent.finished",
      roomId: "mock-slides",
      role: "助手",
      text: "幻灯片大纲已放在云端空间",
      occurredAt: daysAgo(11),
    },
  ],
  "mock-approval": [
    {
      id: "mock-approval-act",
      sequence: 1,
      type: "approval.asked",
      roomId: "mock-approval",
      toolName: "提交审批",
      reason: "把准入说明交给合规",
      occurredAt: daysAgo(1),
    },
  ],
};

const approvals: Record<string, Approval | null> = {
  "mock-slides": null,
  "mock-summary": null,
  "mock-approval": {
    id: "mock-approval-card",
    roomId: "mock-approval",
    toolName: "提交审批",
    reason: "把准入说明交给合规。",
    status: "pending",
    createdAt: daysAgo(1),
  },
};

export function isMockRoom(id: string) {
  return id.startsWith("mock-");
}

export function mockMessages(id: string) {
  return messages[id] ?? [];
}

export function mockActivity(id: string) {
  return activity[id] ?? [];
}

export function mockApproval(id: string) {
  return approvals[id] ?? null;
}

export type MockArtifact = { id: string; name: string; kind: string; body: string };

const artifacts: Record<string, MockArtifact[]> = {
  "mock-slides": [
    {
      id: "slides-deck",
      name: "泡泡玛特品牌介绍幻灯片",
      kind: "幻灯片",
      body: "8 页大纲：品牌一句话、产品线、会员、门店。产物留在云端空间，不写到这台电脑。",
    },
  ],
  "mock-approval": [
    {
      id: "approval-doc",
      name: "供应商准入说明",
      kind: "文档",
      body: "草案已写好。提交审批前需要你确认这一次。",
    },
  ],
};

export function mockArtifacts(id: string) {
  return artifacts[id] ?? [];
}
