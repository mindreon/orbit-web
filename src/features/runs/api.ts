import { useQuery } from "@tanstack/react-query";
import type { Run, S, Session } from "../../api/types";
import type { RequestOptions } from "../../api/client";
import { api } from "../../platform/client";
import { qk } from "../../platform/queryKeys";
export const isActiveRun = (status: S["RunState"]) => ["queued", "running", "waiting_input", "waiting_approval", "paused"].includes(status);
async function allPages<T>(path: string, options: RequestOptions) {
  const items: T[] = []; let cursor: string | undefined;
  for (;;) {
    const page: { items: T[]; next_cursor?: string } = await api.get(path, { ...options, query: { cursor, limit: 100 } });
    items.push(...(page.items ?? []));
    if (!page.next_cursor) return items;
    if (page.next_cursor === cursor) throw new Error("分页游标未前进");
    cursor = page.next_cursor;
  }
}
export function useRun(runId: string, tenant: string | null) {
  return useQuery({ queryKey: qk.run(tenant, runId), queryFn: ({ signal }) => api.get<Run>(`/runs/${runId}`, { signal }) });
}
export function useRunResources(run: Run, tenant: string | null) {
  const segments = useQuery({ queryKey: qk.segments(tenant, run.id), queryFn: async ({ signal }) => (await allPages<S["Segment"]>(`/runs/${run.id}/segments`, { signal })).map((segment) => ({ ...segment, usage: segment.usage ?? [] })) });
  const effects = useQuery({ queryKey: qk.effects(tenant, run.id), queryFn: ({ signal }) => allPages<S["RunEffect"]>(`/runs/${run.id}/effects`, { signal }) });
  const interactions = useQuery({ queryKey: qk.runInteractions(tenant, run.id), queryFn: async ({ signal }) => ({ items: (await allPages<S["Interaction"]>(`/runs/${run.id}/interactions`, { signal })).map((item) => ({
    ...item,
    approvers: item.approvers ?? [],
    request: {
      ...item.request,
      ...(item.request.question ? { question: { ...item.request.question, options: item.request.question.options ?? [] } } : {}),
      ...(item.request.calls ? { calls: item.request.calls.map((call) => ({ ...call, risk_reasons: call.risk_reasons ?? [] })) } : {}),
    },
  })), capped: false }) });
  const cost = useQuery({ queryKey: qk.cost(tenant, run.id), queryFn: async ({ signal }) => {
    const value = await api.get<S["RunCost"]>(`/runs/${run.id}/cost`, { signal });
    return { ...value, items: value.items ?? [] };
  } });
  const session = useQuery({ queryKey: qk.session(tenant, run.session_id), queryFn: ({ signal }) => api.get<Session>(`/sessions/${run.session_id}`, { signal }) });
  return { segments, effects, interactions, cost, session };
}
