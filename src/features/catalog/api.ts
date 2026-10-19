import { useQuery } from "@tanstack/react-query";
import type { Asset, EntryKind, S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { catalogItems } from "./catalogItems";
export async function loadCatalog(kind: EntryKind, workspace?: string, signal?: AbortSignal) {
  const assets: Asset[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page: S["AssetPage"] = await api.get("/assets", { query: { kind, limit: 100, cursor }, signal });
    assets.push(...page.items);
    if (page.next_cursor && page.next_cursor === cursor) throw new Error("目录游标未前进");
    cursor = page.next_cursor || undefined;
    if (!cursor) break;
  }
  async function installs(path: string) {
    const result: S["InstallPage"]["items"] = [];
    let after: string | undefined;
    do {
      const page: S["InstallPage"] = await api.get(path, { query: { limit: 100, cursor: after }, signal });
      result.push(...page.items);
      if (page.next_cursor && page.next_cursor === after) throw new Error("安装游标未前进");
      after = page.next_cursor || undefined;
    } while (after);
    return result;
  }
  const [local, global] = await Promise.all([workspace ? installs(`/workspaces/${workspace}/installs`) : [], installs("/installs")]);
  return { items: catalogItems(assets, local, global), capped: Boolean(cursor) };
}
export function useCatalog(kind: EntryKind) {
  const { currentTenant } = useIdentity();
  const { current } = useWorkspace();
  return useQuery({ queryKey: qk.assets(currentTenant?.id ?? null, { catalog: kind, workspace: current?.id }), queryFn: ({ signal }) => loadCatalog(kind, current?.id, signal) });
}
