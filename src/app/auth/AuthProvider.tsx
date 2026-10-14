import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { fetchMe } from "../../api/auth";
import { describeFailure } from "../../api/errors";
import { api, auth } from "../api";
import { AuthContext, type AuthValue } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  useEffect(() => {
    void auth.initialize();
  }, []);

  // What was loaded belongs to the person and tenant that loaded it.
  const signedIn = snapshot.status === "authenticated";
  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn, queryClient]);

  const me = useQuery({ queryKey: ["me", snapshot.tenantId], queryFn: ({ signal }) => fetchMe(api, signal), enabled: signedIn });

  const switchTenant = useCallback(
    (tenantId: string) => {
      auth.setTenant(tenantId);
      void queryClient.resetQueries();
    },
    [queryClient],
  );
  const { refetch } = me;
  // Anonymous with no config means the login config could not be read; otherwise it is the profile that failed.
  const retry = useCallback(() => void (auth.getSnapshot().status === "anonymous" ? auth.initialize() : refetch()), [refetch]);

  const value = useMemo<AuthValue>(() => {
    const data = me.data;
    const status = snapshot.status === "anonymous" ? "anonymous" : snapshot.status === "initializing" || me.isPending ? "loading" : data ? "ready" : "failed";
    return {
      status,
      error: snapshot.error ?? (me.isError ? describeFailure("读取个人信息失败", me.error) : null),
      config: snapshot.config,
      principal: data?.principal ?? null,
      tenants: data?.tenants ?? [],
      currentTenant: data?.tenants.find((tenant) => tenant.id === data.current_tenant) ?? null,
      roles: data?.roles ?? [],
      login: (returnTo) => auth.login(returnTo),
      loginDev: (input) => auth.loginDev(input),
      switchTenant,
      logout: () => auth.logout(),
      retry,
    };
  }, [snapshot, me.data, me.isPending, me.isError, me.error, switchTenant, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
