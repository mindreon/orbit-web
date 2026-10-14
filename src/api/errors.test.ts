import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, describeFailure, isRetryable } from "./errors";

const apiError = (retryable: boolean) => new ApiError(400, { code: "X", message: "原因", retryable });

describe("isRetryable", () => {
  it("is true only for API and network failures that say so", () => {
    expect(isRetryable(apiError(true))).toBe(true);
    expect(isRetryable(apiError(false))).toBe(false);
    expect(isRetryable(new NetworkError(new TypeError()))).toBe(true);
    expect(isRetryable(new TypeError("a bug"))).toBe(false);
    expect(isRetryable(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});

describe("describeFailure", () => {
  it("names the action and the cause", () => {
    expect(describeFailure("保存失败", apiError(false))).toBe("保存失败：原因");
    expect(describeFailure("保存失败", new NetworkError(null))).toContain("连不上服务器");
    expect(describeFailure("保存失败", new Error("boom"))).toBe("保存失败：boom");
    expect(describeFailure("保存失败", "oops")).toBe("保存失败：未知错误");
  });

  it("falls back to the status when the server sent no message", () => {
    expect(describeFailure("读取", new ApiError(500, { code: "HTTP_500", message: "", retryable: true }))).toBe("读取：请求失败（HTTP 500）");
  });
});
