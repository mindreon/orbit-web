import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Asset, S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { allAssetPages } from "../assets";
export function useReviews() {
  const { currentTenant } = useIdentity();
  return useInfiniteQuery({ queryKey: qk.reviews(currentTenant?.id ?? null), initialPageParam: undefined as string | undefined, queryFn: ({ signal, pageParam }) => api.get<S["AssetVersionPage"]>("/reviews", { signal, query: { cursor: pageParam, limit: 100 } }), getNextPageParam: (page) => page.next_cursor || undefined, refetchInterval: 5000 });
}
export function useReview(id: string, assetId: string | null) {
  const { currentTenant } = useIdentity();
  return useQuery({ queryKey: qk.review(currentTenant?.id ?? null, id, assetId), queryFn: async ({ signal }) => {
    // Control has no GET /reviews/{v}. Resolve a naked deep link through visible assets;
    // list links carry an asset hint, but never depend on transient router state.
    if (assetId) return api.get<S["AssetVersion"]>(`/assets/${assetId}/versions/${id}`, { signal });
    const assets = await allAssetPages<Asset>("/assets", signal);
    for (const asset of assets) {
      const versions = await allAssetPages<S["AssetVersion"]>(`/assets/${asset.id}/versions`, signal);
      const version = versions.find((v) => v.id === id); if (version) return version;
    }
    throw new Error("找不到此审核版本或无权查看");
  }, refetchInterval: (query) => ["submitted", "checking", "in_review", "approved"].includes(query.state.data?.state ?? "") ? 3000 : false });
}
export function useDecision(assetId: string, versionId: string) {
  const { currentTenant } = useIdentity(); const cache = useQueryClient(); const tenant = currentTenant?.id ?? null;
  return useMutation({ mutationFn: ({ input, key }: { input: S["ReviewInput"]; key: string }) => api.post(`/reviews/${versionId}:decide`, input, { idempotencyKey: key }), onSuccess: async () => { await Promise.all([cache.invalidateQueries({ queryKey: qk.reviews(tenant) }), cache.invalidateQueries({ queryKey: qk.review(tenant, versionId) }), cache.invalidateQueries({ queryKey: qk.asset(tenant, assetId) }), cache.invalidateQueries({ queryKey: qk.assetLists(tenant) })]); } });
}
