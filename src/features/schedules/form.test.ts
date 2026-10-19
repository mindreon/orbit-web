import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import type { S } from "../../api/types";
import { budgetToMillicredits, scheduleFieldErrors } from "./form";
import { overlapLabels, scheduleRunLabels, scheduleStatusLabels } from "./labels";
describe("schedule form conversion and server errors", () => {
  it("converts credits exactly without floating point rounding", () => {
    expect(budgetToMillicredits("100")).toBe(100000); expect(budgetToMillicredits("1.001")).toBe(1001); expect(budgetToMillicredits("8.123")).toBe(8123);
    for (const value of ["0.999", "-1", "1.0001", "NaN", "1e3", "", "999999999999999999"]) expect(budgetToMillicredits(value)).toBeNull();
  });
  it("maps actual control schedule codes with absent details to the failing field", () => {
    expect(scheduleFieldErrors(new ApiError(422, { code: "SCHEDULE_INTERVAL_TOO_SHORT", message: "Schedule interval must be at least five minutes", retryable: false }))).toEqual({ cron: "触发间隔不能短于 5 分钟" });
    expect(scheduleFieldErrors(new ApiError(422, { code: "SCHEDULE_INVALID_TIMEZONE", message: "", retryable: false }))).toEqual({ timezone: "请选择有效的时区" });
    expect(scheduleFieldErrors(new ApiError(422, { code: "INVALID_INPUT", message: "无效", retryable: false, details: { field: "name", message: "名称太长" } }))).toEqual({ name: "名称太长" });
    expect(scheduleFieldErrors(new Error("offline"))).toEqual({});
    expect(scheduleFieldErrors(new ApiError(500, { code: "INTERNAL", message: "", retryable: true }))).toEqual({});
  });
  it("U5 schedule label keys cover protocol enums", () => {
    const statuses: S["Schedule"]["status"][] = ["active", "paused", "deleted"];
    const runs: S["ScheduleRun"]["status"][] = ["running", "succeeded", "failed", "cancelled", "budget_exhausted", "timed_out", "skipped"];
    expect(Object.keys(scheduleStatusLabels).sort()).toEqual(statuses.sort()); expect(Object.keys(scheduleRunLabels).sort()).toEqual(runs.sort()); expect(Object.keys(overlapLabels).sort()).toEqual(["buffer_one", "skip"]);
  });
});
