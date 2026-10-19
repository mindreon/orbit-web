import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { operations } from "../../api/schema";
import type { S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
export type ModelMetadata = operations["listAdminModels"]["responses"][200]["content"]["application/json"]["items"][number];
export type SecretMetadata = operations["listAdminSecrets"]["responses"][200]["content"]["application/json"]["items"][number];
export type QuotaMetadata = operations["listAdminQuotas"]["responses"][200]["content"]["application/json"]["items"][number];
export interface Page<T> { items: T[]; next_cursor?: string }
export function useAdminList<T>(resource: string, path: string, enabled = true) {
  const { currentTenant } = useIdentity();
  return useInfiniteQuery({ queryKey: qk.admin(currentTenant?.id ?? null, resource), enabled, initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<Page<T>>(path, { signal, query: { limit: 100, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export const saveMember = (id: string, body: S["MemberPatch"], key: string) => api.patch(`/admin/members/${id}`, body, { idempotencyKey: key });
export const createKey = (body: S["APIKeyInput"], key: string) => api.post<S["APIKeyCreated"]>("/admin/api-keys", body, { idempotencyKey: key });
export const revokeKey = (id: string, key: string) => api.delete(`/admin/api-keys/${id}`, { idempotencyKey: key });
export const createService = (body: S["ServicePrincipalInput"], key: string) => api.post<S["Principal"]>("/admin/service-principals", body, { idempotencyKey: key });
export const createWorkspace = (body: S["CreateWorkspace"], key: string) => api.post<S["Workspace"]>("/workspaces", body, { idempotencyKey: key });
export const saveWorkspace = (id: string, body: S["PatchWorkspace"], key: string) => api.patch<S["Workspace"]>(`/workspaces/${id}`, body, { idempotencyKey: key });
export const addWorkspaceMember = (id: string, body: S["WorkspaceMemberInput"], key: string) => api.post(`/workspaces/${id}/members`, body, { idempotencyKey: key });
export const removeWorkspaceMember = (id: string, principal: string, key: string) => api.delete(`/workspaces/${id}/members/${principal}`, { idempotencyKey: key });
export function useAdminWorkspace(id: string) {
  const { currentTenant } = useIdentity();
  return useQuery({ queryKey: qk.admin(currentTenant?.id ?? null, `workspace:${id}`), queryFn: ({ signal }) => api.get<S["Workspace"]>(`/workspaces/${id}`, { signal }) });
}
export type UsageFilters = { scope: "tenant" | "workspace" | "user"; id?: string; from: string; to: string; granularity: "hour" | "day" | "month"; group_by: string };
export function useUsage(filters: UsageFilters, enabled: boolean) {
  const { currentTenant } = useIdentity();
  return useQuery({ queryKey: qk.admin(currentTenant?.id ?? null, `usage:${JSON.stringify(filters)}`), enabled, queryFn: ({ signal }) => api.get<S["UsageReport"]>("/usage", { signal, query: filters }) });
}
