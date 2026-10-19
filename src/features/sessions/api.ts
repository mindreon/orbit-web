import { useInfiniteQuery } from "@tanstack/react-query";
import type { Session, S } from "../../api/types";
export { useEntries } from "../../platform/entries";
import type { RequestOptions } from "../../api/client";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
interface Page<T> { items: T[]; next_cursor?: string }
export async function allPages<T>(path: string, options: RequestOptions = {}, max = Infinity) {
  const items: T[] = []; let cursor: string | undefined;
  for (let i = 0; i < max; i++) {
    const page: Page<T> = await api.get(path, { ...options, query: { ...options.query, limit: 100, cursor } });
    items.push(...page.items);
    if (page.next_cursor && page.next_cursor === cursor) throw new Error("分页游标未前进");
    cursor = page.next_cursor || undefined;
    if (!cursor) break;
  }
  return { items, capped: Boolean(cursor) };
}
export function useRecentSessions() {
  const { currentTenant } = useIdentity(); const { current } = useWorkspace();
  return useInfiniteQuery({ queryKey: qk.sessions(currentTenant?.id ?? null, current?.id), enabled: Boolean(current), initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api.get<Page<Session>>("/sessions", { signal, query: { workspace_id: current?.id, order: "recent", limit: 12, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export const createSession = (body: { workspace_id: string; entry_kind: S["EntryKind"]; entry_ref: string; title: string; message_policy: Session["message_policy"] }, key: string) => api.post<Session>("/sessions", body, { idempotencyKey: key });
export const activeStatus = (status: S["RunState"]) => ["queued", "running", "waiting_input", "waiting_approval", "paused"].includes(status);
