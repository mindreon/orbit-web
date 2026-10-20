import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Asset, S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
export function useAssets(filter: { kind?: Asset["kind"]; q?: string; owner?: "me" }) {
  const { currentTenant } = useIdentity(); const query = { ...filter, limit: 100 };
  return useInfiniteQuery({ placeholderData: keepPreviousData, queryKey: qk.assets(currentTenant?.id ?? null, query), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<S["AssetPage"]>("/assets", { signal, query: { ...query, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export function useAsset(id?: string) {
  const { currentTenant } = useIdentity();
  return useQuery({ queryKey: qk.asset(currentTenant?.id ?? null, id ?? ""), enabled: Boolean(id), queryFn: ({ signal }) => api.get<Asset>(`/assets/${id}`, { signal }) });
}
export function useAssetList<T = unknown>(id: string, suffix: string, params: Record<string, string | number | undefined> = {}) {
  const { currentTenant } = useIdentity();
  return useInfiniteQuery({ queryKey: qk.assets(currentTenant?.id ?? null, { id, suffix, ...params }), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<{ items: T[]; next_cursor?: string }>(`/assets/${id}/${suffix}`, { signal, query: { limit: 100, ...params, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export function useAssetScopeList<T = unknown>(path: string) {
  const { currentTenant } = useIdentity();
  return useInfiniteQuery({ queryKey: qk.assets(currentTenant?.id ?? null, { path }), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<{ items: T[]; next_cursor?: string }>(path, { signal, query: { limit: 100, cursor: pageParam } }), getNextPageParam: (page) => page.next_cursor || undefined });
}
export function useDependents(id: string, kind = "agent") { return useAssetList<AssetDependent>(id, "dependents", { kind, limit: 50 }); }
export interface AssetDependent { asset: Asset; versions: { id: string; version: string; state: S["AssetVersion"]["state"] }[] }
export function useAssetMutation(id: string) {
  const cache = useQueryClient(); const { currentTenant } = useIdentity(); const tenant = currentTenant?.id ?? null;
  return useMutation({ mutationFn: (action: () => Promise<unknown>) => action(), onSuccess: async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: qk.asset(tenant, id) }), cache.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === tenant && ["assets", "installs"].includes(String(queryKey[1])) })]);
  } });
}
export const createAsset = (body: S["AssetInput"], key: string) => api.post<Asset>("/assets", body, { idempotencyKey: key });
export const patchAsset = (id: string, body: S["AssetPatch"], key: string) => api.patch<Asset>(`/assets/${id}`, body, { idempotencyKey: key });
export const assetAction = (id: string, action: string, key: string) => action === "archive" ? api.delete(`/assets/${id}`, { idempotencyKey: key }) : api.post(`/assets/${id}:${action}`, undefined, { idempotencyKey: key });
export const submitVersion = (asset: string, version: string, channel: string, key: string) => api.post(`/assets/${asset}/versions/${version}:submit`, { channel }, { idempotencyKey: key });
export const withdrawVersion = (asset: string, version: string, key: string) => api.post(`/assets/${asset}/versions/${version}:withdraw`, undefined, { idempotencyKey: key });
export const transitionVersion = (asset: string, version: string, state: string, key: string) => api.post(`/assets/${asset}/versions/${version}:transition`, { state }, { idempotencyKey: key });
export const setChannel = (asset: string, channel: string, version_id: string, key: string) => api.post(`/assets/${asset}/channels/${channel}`, { version_id }, { idempotencyKey: key });
export const changeGrant = (id: string, grant: S["GrantInput"], revoke: boolean, key: string) => revoke ? api.delete(`/assets/${id}/grants`, { idempotencyKey: key, body: grant }) : api.post(`/assets/${id}/grants`, grant, { idempotencyKey: key });
export const installAsset = (asset: string, constraint: string, scope: "workspace" | "tenant", workspace: string | undefined, channel: string, key: string) => api.post(scope === "workspace" ? `/workspaces/${workspace}/installs` : "/installs", { asset_id: asset, version_constraint: constraint, channel }, { idempotencyKey: key });
export const uninstallAsset = (id: string, key: string) => api.delete(`/installs/${id}`, { idempotencyKey: key });
export const assetFile = (asset: string, version: string, path: string) => api.getBlob(`/assets/${asset}/versions/${version}/file`, { query: { path } });
