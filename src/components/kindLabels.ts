import type { Asset, AssetKind, EntryKind } from "../api/types";
export const kindLabels = { agent: "专家", team: "专家团", skill: "技能", mcp_server: "MCP 服务" } as const satisfies Record<AssetKind, string>;
export const entryKindLabels = { agent: "专家", team: "专家团" } as const satisfies Record<EntryKind, string>;

export const visibilityLabels = { private: "私有", workspace: "工作空间", tenant: "全员可见" } as const satisfies Record<Asset["visibility"], string>;
