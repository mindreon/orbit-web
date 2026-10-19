import type { S } from "../../api/types";
type CostItem = S["RunCost"]["items"][number];
export interface CostGroup { key: string; member: string | null; model: string | null; meter: CostItem["meter"]; quantities: string[]; total: string; millicredits: number }
/** Exact sum of non-negative decimal strings; null when any part is not a plain decimal. */
export function sumDecimals(parts: readonly string[]): string | null {
  if (!parts.every((part) => /^\d+(\.\d+)?$/.test(part))) return null;
  const scale = Math.max(0, ...parts.map((part) => part.split(".")[1]?.length ?? 0));
  const total = parts.reduce((sum, part) => { const [whole, fraction = ""] = part.split("."); return sum + BigInt(whole + fraction.padEnd(scale, "0")); }, 0n).toString().padStart(scale + 1, "0");
  return scale ? `${total.slice(0, -scale)}.${total.slice(-scale)}`.replace(/\.?0+$/, "") : total;
}
/** Quantities are opaque decimal strings. Preserve every ledger value rather than round it through Number. */
export function groupCosts(items: readonly CostItem[]): CostGroup[] {
  const groups = new Map<string, CostGroup>();
  for (const item of items) {
    const model = item.model ?? item.model_profile_name ?? item.model_profile_id ?? null;
    const key = JSON.stringify([item.member, model, item.meter]);
    const group = groups.get(key) ?? { key, member: item.member, model, meter: item.meter, quantities: [], total: "", millicredits: 0 };
    group.quantities.push(item.quantity); group.millicredits += item.millicredits; groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, total: sumDecimals(group.quantities) ?? group.quantities.join(" + ") }));
}
