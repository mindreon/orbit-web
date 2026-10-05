import type { BudgetAmounts } from "./taskEvents";

export interface UsageRow {
  readonly key: "tokens" | "tool_calls" | "wall_s" | "cost_usd_micros";
  readonly label: string;
  /** What the task has used so far, as text. A cost nobody has priced is 「未知」, never 0. */
  readonly used: string;
  /** The limit, as text; null when the task has none for it. */
  readonly limit: string | null;
  /** What the running attempts hold back, as text; null when nothing is held. */
  readonly reserved: string | null;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Micro-dollars as dollars. */
export const formatCost = (micros: number): string => `$${(micros / 1_000_000).toFixed(4)}`;

const formatSeconds = (seconds: number): string => (seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`);

const FORMAT: Record<UsageRow["key"], (value: number) => string> = {
  tokens: (value) => value.toLocaleString("en-US"),
  tool_calls: (value) => String(value),
  wall_s: formatSeconds,
  cost_usd_micros: formatCost,
};

const LABEL: Record<UsageRow["key"], string> = { tokens: "令牌", tool_calls: "工具调用", wall_s: "用时", cost_usd_micros: "费用" };

/**
 * The task's usage and limits as rows. `usage` and `budgets` are the task's own maps (usage has `tokens_in` and
 * `tokens_out`, budgets has `tokens`); `reserved` is what the running attempts hold. A cost that is missing or null
 * has not been priced: it reads 「未知」.
 */
export function usageRows(usage: Record<string, unknown> | undefined, budgets: Record<string, unknown> | undefined, reserved: BudgetAmounts): UsageRow[] {
  const used: Record<UsageRow["key"], number | null> = {
    tokens: (num(usage?.tokens_in) ?? 0) + (num(usage?.tokens_out) ?? 0),
    tool_calls: num(usage?.tool_calls) ?? 0,
    wall_s: num(usage?.wall_s) ?? 0,
    cost_usd_micros: num(usage?.cost_usd_micros),
  };
  return (Object.keys(LABEL) as UsageRow["key"][]).map((key) => {
    const limit = num(budgets?.[key]);
    const held = reserved[key];
    const usedValue = used[key];
    return {
      key,
      label: LABEL[key],
      used: usedValue === null ? "未知" : FORMAT[key](usedValue),
      limit: limit === null ? null : FORMAT[key](limit),
      reserved: held === undefined ? null : FORMAT[key](held),
    };
  });
}

/**
 * Nothing metered yet, no limit set and nothing held back: there is nothing to tabulate, so the panel is one line
 * instead of four rows of zeros. A unit of usage that is unknown (an unpriced cost) does not count as metered.
 */
export function isUsageIdle(usage: Record<string, unknown> | undefined, budgets: Record<string, unknown> | undefined, reserved: BudgetAmounts): boolean {
  const metered = ["tokens_in", "tokens_out", "tool_calls", "wall_s", "cost_usd_micros"].some((key) => (num(usage?.[key]) ?? 0) > 0);
  const limited = (Object.keys(LABEL) as UsageRow["key"][]).some((key) => num(budgets?.[key]) !== null);
  const held = (Object.keys(LABEL) as UsageRow["key"][]).some((key) => reserved[key] !== undefined);
  return !metered && !limited && !held;
}

export interface GrantInput {
  readonly tokens: string;
  readonly tool_calls: string;
  readonly wall_s: string;
  /** In dollars, as a person writes it. */
  readonly cost_usd: string;
}

export const emptyGrant: GrantInput = { tokens: "", tool_calls: "", wall_s: "", cost_usd: "" };

/** What a person typed into the grant form: the budget to add, or why it cannot be sent. A blank field adds nothing. */
export function parseGrant(input: GrantInput): { readonly delta: BudgetAmounts; readonly error: "" } | { readonly delta: null; readonly error: string } {
  const out: { -readonly [K in keyof BudgetAmounts]: number } = {};
  const whole = (text: string, label: string, set: (value: number) => void): string => {
    if (text.trim() === "") return "";
    const value = Number(text);
    if (!Number.isInteger(value) || value <= 0) return `${label}要填大于 0 的整数。`;
    set(value);
    return "";
  };
  const problems = [
    whole(input.tokens, "令牌", (value) => (out.tokens = value)),
    whole(input.tool_calls, "工具调用", (value) => (out.tool_calls = value)),
    whole(input.wall_s, "用时（秒）", (value) => (out.wall_s = value)),
  ];
  if (input.cost_usd.trim() !== "") {
    const dollars = Number(input.cost_usd);
    const micros = Math.round(dollars * 1_000_000);
    if (!Number.isFinite(dollars) || micros <= 0) problems.push("费用要填大于 0 的金额（美元）。");
    else out.cost_usd_micros = micros;
  }
  const error = problems.find((problem) => problem !== "");
  if (error) return { delta: null, error };
  if (Object.keys(out).length === 0) return { delta: null, error: "至少填一项要追加的额度。" };
  return { delta: out, error: "" };
}
