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

  it("keeps the server's own words for a code it does not know, and for no code", () => {
    expect(describeFailure("操作失败", new ApiError("http", 500, "boom", "WHATEVER"))).toBe("操作失败：后端返回错误（HTTP 500）：boom");
    expect(describeFailure("操作失败", new ApiError("http", 400, "bad", ""))).toBe("操作失败：后端返回错误（HTTP 400）：bad");
  });

  it("blames the network when there was no response", () => {
    expect(describeFailure("操作失败", new ApiError("unreachable", null, ""))).toContain("后端连不上");
  });
});
