import { describe, expect, it } from "vitest";
import { ApiError, describeFailure, refusalText } from "./api";

describe("describeFailure", () => {
  it("says a known refusal in Chinese, whatever the server wrote", () => {
    const error = new ApiError("http", 409, "node is frozen", "FROZEN_NODE");
    expect(describeFailure("操作失败", error)).toBe(`操作失败：${refusalText.FROZEN_NODE}`);
  });

  it("covers every refusal type control answers a task update with", () => {
    for (const code of ["FROZEN_NODE", "INVALID_TRANSITION", "STALE_ATTEMPT", "VERSION_CONFLICT", "TASK_CLOSED", "CONFIG_VERSION_CONFLICT", "UNKNOWN_APPROVAL", "UNKNOWN_PROFILE", "SCHEMA_INVALID", "POLICY_DENIED"]) {
      expect(refusalText[code], code).toBeTruthy();
    }
  });

  it("says every expert and team refusal control names in Chinese", () => {
    for (const code of ["NAME_INVALID", "KIND_INVALID", "KIND_IMMUTABLE", "FIELD_NOT_ALLOWED", "INSTRUCTIONS_TOO_LONG", "MODEL_INVALID", "CONNECTORS_INVALID", "CONNECTOR_NOT_FOUND", "SKILLS_INVALID", "SKILL_NOT_FOUND", "SKILL_UNUSABLE", "TEAM_NO_MEMBERS", "TEAM_TOO_MANY_MEMBERS", "TEAM_DUPLICATE_ROLE", "TEAM_LEADER_NOT_MEMBER", "ROLE_INVALID", "TEAM_MEMBER_REF_INVALID", "TEAM_MEMBER_NOT_FOUND", "TEAM_MEMBER_IS_TEAM", "TEAM_SELF_REFERENCE", "DESCRIPTION_TOO_LONG", "LABEL_TOO_LONG", "TEAM_MALFORMED", "MODE_INVALID", "EXPERT_REF_INVALID", "EXPERT_NOT_FOUND", "TEAM_REF_NOT_TEAM", "EXPERT_TEAM_MISMATCH"]) {
      expect(refusalText[code], code).toBeTruthy();
      expect(refusalText[code], code).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("keeps the server's own words for a code it does not know, and for no code", () => {
    expect(describeFailure("操作失败", new ApiError("http", 500, "boom", "WHATEVER"))).toBe("操作失败：后端返回错误（HTTP 500）：boom");
    expect(describeFailure("操作失败", new ApiError("http", 400, "bad", ""))).toBe("操作失败：后端返回错误（HTTP 400）：bad");
  });

  it("blames the network when there was no response", () => {
    expect(describeFailure("操作失败", new ApiError("unreachable", null, ""))).toContain("后端连不上");
  });
});
