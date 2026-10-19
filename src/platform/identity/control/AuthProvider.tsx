import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { fetchMe } from "../../../api/auth";
import { describeFailure } from "../../../api/errors";
import { api } from "../../client";
import { auth } from "./adapter";
import { qk } from "../../queryKeys";
import { AuthContext, type AuthValue } from "./context";
import { useTenantSelection } from "../context";
import { useIdentity } from "../context";

/** Only control's sign-in views need its additional protocol-specific operations. */
export function ControlSignInProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const switchTenant = useTenantSelection();
  const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const value: AuthValue = {
    status: identity.status === "authenticated" ? "ready" : identity.status === "initializing" ? "loading" : identity.status,
    error: identity.error,
    config: snapshot.config,
    principal: identity.principal,
    tenants: identity.tenants,
    currentTenant: identity.currentTenant,
    roles: identity.roles,
    login: (returnTo) => auth.login(returnTo),
    loginDev: (input) => auth.loginDev(input),
    switchTenant,
    logout: identity.signOut,
    retry: identity.retry,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

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

  const me = useQuery({ queryKey: qk.me(snapshot.tenantId), queryFn: ({ signal }) => fetchMe(api, signal), enabled: signedIn });

  const switchTenant = useCallback(
    (tenantId: string) => {
      queryClient.clear();
      auth.setTenant(tenantId);
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
