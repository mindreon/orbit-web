import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "../../api/client";
import { ApiError, describeFailure } from "../../api/errors";
import type { Me } from "../../api/types";
import { qk } from "../queryKeys";
import { IdentityContext, TenantSelectionContext, type IdentityValue } from "./context";
import type { IdentityAdapter } from "./index";

export function IdentityProvider({ adapter, client, children }: { adapter: IdentityAdapter; client?: ApiClient; children: ReactNode }) {
  const cache = useQueryClient();
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.snapshot);
  const [tenant, setTenant] = useState(adapter.credentials.tenant());
  const api = useMemo(() => client ?? createApiClient({ credentials: adapter.credentials }), [adapter, client]);
  useEffect(() => { void adapter.initialize(); }, [adapter]);
  useEffect(() => { if (snapshot.status !== "authenticated") { cache.clear(); setTenant(null); } }, [snapshot.status, cache]);
  const me = useQuery({
    queryKey: qk.me(tenant),
    queryFn: async ({ signal }) => {
      const requestedTenant = adapter.credentials.tenant();
      try { return await api.get<Me>("/me", { signal }); }
      catch (error) {
        if (error instanceof ApiError && error.status === 403 && requestedTenant && adapter.credentials.tenant() === requestedTenant) {
          // Recover memberships without a revoked tenant header; TenantGate then chooses an active tenant.
          adapter.setTenant(null);
          return api.get<Me>("/me", { signal });
        }
        throw error;
      }
    },
    enabled: snapshot.status === "authenticated",
  });
  const switchTenant = useCallback((id: string) => {
    cache.clear();
    adapter.setTenant(id);
    setTenant(id);
  }, [cache, adapter]);
  const signOut = useCallback(async () => {
    cache.clear();
    setTenant(null);
    await adapter.signOut();
  }, [cache, adapter]);
  const value: IdentityValue = {
    status: snapshot.status !== "authenticated" ? snapshot.status : me.isPending ? "initializing" : me.isError ? "failed" : "authenticated",
    error: snapshot.error ?? (me.isError ? describeFailure("读取个人信息失败", me.error) : null),
    principal: me.data?.principal ?? null,
    tenants: me.data?.tenants ?? [],
    currentTenant: me.data?.tenants.find((item) => item.id === me.data.current_tenant) ?? null,
    roles: me.data?.roles ?? [],
    platformOperator: me.data?.platform_operator ?? false,
    rememberedTenant: adapter.credentials.tenant(),
    signOut, adapter,
    retry: () => { if (snapshot.status === "anonymous") void adapter.initialize(); else void me.refetch(); },
  };
  return <IdentityContext.Provider value={value}><TenantSelectionContext.Provider value={switchTenant}>{children}</TenantSelectionContext.Provider></IdentityContext.Provider>;
}
