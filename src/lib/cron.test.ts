import { describe, expect, it } from "vitest";
import { describeCron, nextFires } from "./cron";
describe("cron reading and next fire times", () => {
  it("reads daily and interval schedules in Chinese", () => {
    expect(describeCron("0 3 * * *")).toBe("每天 03:00");
    expect(describeCron("*/5 * * * *")).toBe("每 5 分钟");
    expect(describeCron("broken")).toBe("请输入有效的五段 cron");
  });
  it("returns three strictly future zoned instants", () => {
    expect(nextFires("0 3 * * *", "Asia/Shanghai", new Date("2026-10-20T18:59:00Z"))).toEqual(["2026-10-20T19:00:00.000Z", "2026-10-21T19:00:00.000Z", "2026-10-22T19:00:00.000Z"]);
    expect(nextFires("0 3 * * *", "Asia/Kathmandu", new Date("2026-10-20T00:00:00Z"))[0]).toBe("2026-10-20T21:15:00.000Z");
  });
  it("supports ranges, lists, names, Sunday 0 and DST gaps/duplicates", () => {
    expect(nextFires("0 9 * * MON-FRI", "UTC", new Date("2026-10-23T09:00:00Z"))[0]).toBe("2026-10-26T09:00:00.000Z");
    expect(nextFires("0 1 * * 0", "UTC", new Date("2026-10-24T00:00:00Z"))[0]).toBe("2026-10-25T01:00:00.000Z");
    expect(nextFires("0 1 ? * SUN", "UTC", new Date("2026-10-24T00:00:00Z"))[0]).toBe("2026-10-25T01:00:00.000Z");
    expect(nextFires("0 1 25 * ?", "UTC", new Date("2026-10-24T00:00:00Z"))[0]).toBe("2026-10-25T01:00:00.000Z");
    expect(nextFires("30 1 * * *", "America/New_York", new Date("2026-11-01T00:00:00Z")).slice(0, 2)).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
    expect(nextFires("30 2 * * *", "America/New_York", new Date("2026-03-08T00:00:00Z"))[0]).toBe("2026-03-09T06:30:00.000Z");
    expect(nextFires("0,30 8-9 * JAN *", "UTC", new Date("2026-01-01T08:00:00Z"))[0]).toBe("2026-01-01T08:30:00.000Z");
  });
  it("returns rare leap-day schedules without scanning non-matching days", () => {
    expect(nextFires("0 0 29 2 *", "UTC", new Date("2026-03-01T00:00:00Z"))).toEqual(["2028-02-29T00:00:00.000Z", "2032-02-29T00:00:00.000Z", "2036-02-29T00:00:00.000Z"]);
  });
  it("rejects malformed, dual day restrictions and invalid timezones", () => {
    for (const cron of ["*/0 * * * *", "60 * * * *", "0 0 1 * MON", "@daily", "0 0 * * 7", "0 0 * * 8"]) expect(nextFires(cron, "UTC")).toEqual([]);
    expect(nextFires("0 0 * * *", "not/a-zone")).toEqual([]);
  });
});
