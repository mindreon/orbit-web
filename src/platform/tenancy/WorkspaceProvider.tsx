import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { S, Workspace } from "../../api/types";
import { api } from "../client";
import { useIdentity } from "../identity";
import { qk } from "../queryKeys";

function remembered(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } }
interface WorkspaceValue { workspaces: readonly Workspace[]; current: Workspace | null; loading: boolean; error: unknown; select(id: string): void }
const Context = createContext<WorkspaceValue | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useIdentity();
  const tenant = currentTenant?.id ?? null;
  // A keyed inner provider prevents the previous tenant's selection from appearing during a switch.
  return <TenantWorkspaceProvider key={tenant} tenant={tenant}>{children}</TenantWorkspaceProvider>;
}
function TenantWorkspaceProvider({ tenant, children }: { tenant: string | null; children: ReactNode }) {
  const key = `orbit.workspace.${tenant}`;
  const [selected, setSelected] = useState(() => remembered(key));
  const query = useQuery({ queryKey: qk.workspaces(tenant), enabled: tenant !== null, queryFn: async ({ signal }) => {
    const items: Workspace[] = [];
    let cursor: string | undefined;
    do {
      const page: S["WorkspacePage"] = await api.get("/workspaces", { signal, query: { limit: 100, cursor } });
      items.push(...page.items);
      if (page.next_cursor && page.next_cursor === cursor) throw new Error("工作空间游标未前进");
      cursor = page.next_cursor || undefined;
    } while (cursor);
    return items;
  } });
  const workspaces = query.data ?? [];
  const current = workspaces.find((item) => item.id === selected) ?? workspaces[0] ?? null;
  return <Context.Provider value={{ workspaces, current, loading: query.isPending, error: query.error, select: (id) => {
    if (!workspaces.some((item) => item.id === id)) return;
    setSelected(id);
    try { sessionStorage.setItem(key, id); } catch { /* Storage is an optional per-tab preference. */ }
  } }}>{children}</Context.Provider>;
}
export function useWorkspace(): WorkspaceValue {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
