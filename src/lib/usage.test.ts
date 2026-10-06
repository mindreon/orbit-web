import { describe, expect, it } from "vitest";
import { budgetWarnings, costSummary, emptyGrant, formatCost, isUsageIdle, parseGrant, usageLine, usageRows } from "./usage";

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

describe("usageLine", () => {
  it("says what a turn used and leaves out what it did not", () => {
    expect(usageLine({ tokens_in: 1000, tokens_out: 234, tool_calls: 3, wall_s: 75 })).toBe("令牌 1,234 · 工具 3 次 · 1 分 15 秒");
    expect(usageLine({ tokens_in: 0, tokens_out: 0, tool_calls: 0, wall_s: 0, cost_usd_micros: null })).toBe("");
    expect(usageLine(undefined)).toBe("");
    expect(usageLine({ cost_usd_micros: 1500 })).toBe("$0.0015");
  });
});

describe("costSummary", () => {
  it("says time and tokens, rounded the way a person says them", () => {
    expect(costSummary({ tokens_in: 1_600_000, tokens_out: 90_000, wall_s: 1380 })).toBe("用时 23 分 · 约 169 万 tokens");
    expect(costSummary({ tokens_in: 15_300, wall_s: 42 })).toBe("用时 42 秒 · 约 1.5 万 tokens");
    expect(costSummary({ tokens_in: 800 })).toBe("800 tokens");
  });

  it("adds the cost only when it is priced, and never says 未知", () => {
    expect(costSummary({ tokens_in: 800, cost_usd_micros: 1_234_000 })).toBe("800 tokens · $1.23");
    expect(costSummary({ tokens_in: 800, cost_usd_micros: null })).toBe("800 tokens");
    expect(costSummary({ tokens_in: 800, cost_usd_micros: 0 })).not.toContain("$");
    expect(costSummary(undefined)).toBe("");
  });
});

describe("budgetWarnings", () => {
  it("warns near the limit and when over it, and says nothing for a task without a budget", () => {
    expect(budgetWarnings({ tokens_in: 500 }, { tokens: 1000 })).toEqual([]);
    expect(budgetWarnings({ tokens_in: 850 }, { tokens: 1000 })[0]).toMatchObject({ key: "tokens", over: false });
    expect(budgetWarnings({ tokens_in: 1000 }, { tokens: 1000 })[0]).toMatchObject({ over: true });
    expect(budgetWarnings({ tokens_in: 99999 }, {})).toEqual([]);
    expect(budgetWarnings({ tokens_in: 5 }, { cost_usd_micros: 100 })).toEqual([]);
  });
});
