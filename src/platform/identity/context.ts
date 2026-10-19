import { createContext, useContext } from "react";
import type { Principal, Tenant } from "../../api/types";
import type { IdentityAdapter } from "./index";

export interface IdentityValue {
  status: "initializing" | "anonymous" | "authenticated" | "failed";
  error: string | null;
  principal: Principal | null;
  tenants: readonly Tenant[];
  currentTenant: Tenant | null;
  roles: readonly string[];
  platformOperator: boolean;
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
