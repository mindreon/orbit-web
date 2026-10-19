import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { S } from "../../api/types";
import { api } from "../../platform/client";
import { qk } from "../../platform/queryKeys";
export function useSchedules(tenant: string | null, workspace?: string) {
  return useInfiniteQuery({ queryKey: qk.schedules(tenant, workspace), enabled: Boolean(workspace), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<S["SchedulePage"]>("/schedules", { signal, query: { workspace_id: workspace, limit: 100, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export function useSchedule(tenant: string | null, id?: string) {
  return useQuery({ queryKey: qk.schedule(tenant, id ?? ""), enabled: Boolean(id), queryFn: ({ signal }) => api.get<S["ScheduleDetail"]>(`/schedules/${id}`, { signal }), refetchInterval: (query) => query.state.data?.schedule.sync_pending ? 2000 : false });
}
export const createSchedule = (body: S["ScheduleCreate"], key: string) => api.post<S["Schedule"]>("/schedules", body, { idempotencyKey: key });
export const patchSchedule = (id: string, body: S["SchedulePatch"], key: string) => api.patch<S["Schedule"]>(`/schedules/${id}`, body, { idempotencyKey: key });
export const triggerSchedule = (id: string, key: string) => api.post(`/schedules/${id}/trigger`, undefined, { idempotencyKey: key });
export const deleteSchedule = (id: string, key: string) => api.delete(`/schedules/${id}`, { idempotencyKey: key });
