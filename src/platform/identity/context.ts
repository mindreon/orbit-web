import { createContext, useContext } from "react";
import type { Principal, Tenant } from "../../api/types";
import type { IdentityAdapter } from "./index";

export interface IdentityValue {
  status: "initializing" | "anonymous" | "authenticated" | "failed";
  error: string | null;
  principal: Principal | null;
  tenants: readonly Tenant[];
  currentTenant: Tenant | null;
  defaultTenant: string | null;
  roles: readonly string[];
  platformOperator: boolean;
  /** `/auth/config` 的 mode；null 表示配置还没读到。iam 模式下工作空间 = baize 项目，orbit 不再创建或管理它。 */
  authMode: "dev" | "iam" | "oidc" | null;
  rememberedTenant: string | null;
  signOut(): Promise<void>;
  retry(): void;
  adapter: IdentityAdapter;
}
export const IdentityContext = createContext<IdentityValue | null>(null);
export function useIdentity(): IdentityValue {
  const value = useContext(IdentityContext);
  if (!value) throw new Error("useIdentity must be used inside IdentityProvider");
  return value;
}

// Internal tenancy wiring, deliberately not part of useIdentity() or the public index.
export const TenantSelectionContext = createContext<((tenantId: string) => void) | null>(null);
export function useTenantSelection() {
  const select = useContext(TenantSelectionContext);
  if (!select) throw new Error("useTenantSelection must be used inside IdentityProvider");
  return select;
}
