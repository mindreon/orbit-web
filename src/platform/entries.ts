import { useQuery } from "@tanstack/react-query";
import type { Asset } from "../api/types";
import { api } from "./client";
import { useIdentity } from "./identity";
import { qk } from "./queryKeys";
export function useEntries() {
  const { currentTenant } = useIdentity();
  return useQuery({ queryKey: qk.assets(currentTenant?.id ?? null, { entries: true }), queryFn: async ({ signal }) => {
    const groups = await Promise.all((["agent", "team"] as const).map(async (kind) => {
      const items: Asset[] = []; let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const page: { items: Asset[]; next_cursor?: string } = await api.get("/assets", { signal, query: { kind, limit: 100, cursor } });
        items.push(...(page.items ?? []));
        if (!page.next_cursor) break;
        if (page.next_cursor === cursor) throw new Error("分页游标未前进");
        cursor = page.next_cursor;
      }
      return items;
    }));
    return groups.flat().filter((item) => item.status === "active");
  } });
}
