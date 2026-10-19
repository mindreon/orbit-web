import { expect, it } from "vitest";
import { kindLabels, entryKindLabels } from "./kindLabels";
import { schemaEnum } from "../test/schemaEnum";
it("U5 covers generated kinds with exactly the W49 terminology", () => {
  expect(Object.keys(kindLabels).sort()).toEqual(schemaEnum("AssetKind"));
  expect(Object.keys(entryKindLabels).sort()).toEqual(schemaEnum("EntryKind"));
  expect(kindLabels).toEqual({ agent: "专家", team: "专家团", skill: "技能", mcp_server: "MCP 服务" });
  expect(entryKindLabels).toEqual({ agent: "专家", team: "专家团" });
});
