import { createContext, useContext } from "react";
import type { AuthConfig, DevTokenRequest, Principal, Tenant } from "../../../api/auth";

export interface AuthValue {
  /**
   * `loading`: reading the login config or the profile. `anonymous`: nobody is signed in. `ready`: signed in and `/me` answered.
   * `failed`: signed in but `/me` could not be read (`error` says why); `retry` asks again (it also re-reads the login config when that failed).
   */
  readonly status: "loading" | "anonymous" | "ready" | "failed";
  readonly error: string | null;
  readonly config: AuthConfig | null;
  readonly principal: Principal | null;
  readonly tenants: readonly Tenant[];
  readonly currentTenant: Tenant | null;
  readonly roles: readonly string[];
  /** OIDC: goes to the IdP and comes back to `returnTo`. */
  readonly login: (returnTo: string) => Promise<void>;
  readonly loginDev: (input: DevTokenRequest) => Promise<void>;
  /** Selects another tenant: every request after this one is made in it, and what was loaded for the old one is dropped. */
  readonly switchTenant: (tenantId: string) => void;
  readonly logout: () => Promise<void>;
  readonly retry: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
