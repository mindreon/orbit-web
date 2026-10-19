import { ApiError } from "../../api/errors";
export function budgetToMillicredits(value: string): number | null {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(result) && result >= 1000 ? result : null;
}
export function scheduleFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const mapped: Record<string, [string, string]> = {
    SCHEDULE_INTERVAL_TOO_SHORT: ["cron", "触发间隔不能短于 5 分钟"],
    SCHEDULE_INVALID_CRON: ["cron", "请输入有效的五段 cron，日期和星期不能同时限定"],
    SCHEDULE_INVALID_TIMEZONE: ["timezone", "请选择有效的时区"],
    ENTRY_KIND_AMBIGUOUS: ["entry_ref", "请选择专家或专家团类型"],
    LOCK_RESOLUTION_FAILED: ["entry_ref", "该专家或专家团没有可用的已发布版本，或你没有使用权限"],
  };
  const pair = mapped[error.code];
  if (pair) return { [pair[0]]: pair[1] };
  const details = error.details;
  if (details && typeof details === "object") {
    const { field, message } = details as Record<string, unknown>;
    if (typeof field === "string") return { [field]: typeof message === "string" ? message : error.message };
  }
  return {};
}
