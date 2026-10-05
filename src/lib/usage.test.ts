import { describe, expect, it } from "vitest";
import { emptyGrant, formatCost, isUsageIdle, parseGrant, usageRows } from "./usage";

const row = (rows: ReturnType<typeof usageRows>, key: string) => rows.find((item) => item.key === key)!;

describe("usageRows", () => {
  it("adds tokens in and out and shows the limit and what is held back", () => {
    const rows = usageRows({ tokens_in: 600, tokens_out: 400, tool_calls: 3, wall_s: 75 }, { tokens: 10000, tool_calls: 20 }, { tokens: 2500 });
    expect(row(rows, "tokens")).toMatchObject({ used: "1,000", limit: "10,000", reserved: "2,500" });
    expect(row(rows, "tool_calls")).toMatchObject({ used: "3", limit: "20", reserved: null });
    expect(row(rows, "wall_s")).toMatchObject({ used: "1 分 15 秒", limit: null });
  });

  it("calls a cost that nobody priced unknown, never zero", () => {
    expect(row(usageRows({ tokens_in: 5 }, {}, {}), "cost_usd_micros").used).toBe("未知");
    expect(row(usageRows({ cost_usd_micros: null }, {}, {}), "cost_usd_micros").used).toBe("未知");
    expect(row(usageRows(undefined, undefined, {}), "cost_usd_micros").used).toBe("未知");
  });

  it("shows a known cost, even a small one, in dollars", () => {
    expect(row(usageRows({ cost_usd_micros: 18000 }, { cost_usd_micros: 40000 }, {}), "cost_usd_micros")).toMatchObject({ used: "$0.0180", limit: "$0.0400" });
    expect(formatCost(1)).toBe("$0.0000");
    expect(row(usageRows({ cost_usd_micros: 0 }, {}, {}), "cost_usd_micros").used).toBe("$0.0000");
  });

  it("is zero, not unknown, for what simply has not been used", () => {
    const rows = usageRows(undefined, undefined, {});
    expect(row(rows, "tokens").used).toBe("0");
    expect(row(rows, "tool_calls").used).toBe("0");
  });
});

describe("isUsageIdle", () => {
  it("is idle when nothing is metered, limited or held, however the empty maps are spelled", () => {
    expect(isUsageIdle(undefined, undefined, {})).toBe(true);
    expect(isUsageIdle({}, {}, {})).toBe(true);
    expect(isUsageIdle({ tokens_in: 0, tokens_out: 0, tool_calls: 0, cost_usd_micros: null }, {}, {})).toBe(true);
  });

  it("is not idle once anything is used, limited or held", () => {
    expect(isUsageIdle({ tokens_out: 1 }, {}, {})).toBe(false);
    expect(isUsageIdle({ wall_s: 3 }, undefined, {})).toBe(false);
    expect(isUsageIdle({}, { tokens: 50 }, {})).toBe(false);
    expect(isUsageIdle({}, {}, { tool_calls: 1 })).toBe(false);
  });
});

describe("parseGrant", () => {
  it("sends only the fields that were filled, with the cost in micro-dollars", () => {
    expect(parseGrant({ ...emptyGrant, tokens: "5000", cost_usd: "0.25" })).toEqual({ delta: { tokens: 5000, cost_usd_micros: 250000 }, error: "" });
  });

  it("asks for at least one field", () => {
    expect(parseGrant(emptyGrant).delta).toBeNull();
    expect(parseGrant({ ...emptyGrant, tokens: "  " }).error).toContain("至少");
  });

  it("refuses what the backend would: zero, negative, fractions and text", () => {
    for (const bad of ["0", "-5", "1.5", "abc"]) expect(parseGrant({ ...emptyGrant, tokens: bad }).delta, bad).toBeNull();
    expect(parseGrant({ ...emptyGrant, cost_usd: "0" }).delta).toBeNull();
    expect(parseGrant({ ...emptyGrant, cost_usd: "x" }).delta).toBeNull();
    expect(parseGrant({ ...emptyGrant, wall_s: "-1" }).error).toContain("用时");
  });
});
