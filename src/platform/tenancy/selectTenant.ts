import type { Tenant } from "../../api/types";

export function selectTenant(tenants: readonly Pick<Tenant, "id">[], current: string | null, defaultTenant: string | null, remembered: string | null): string | null {
  if (current && tenants.some((item) => item.id === current)) return current;
  if (defaultTenant && tenants.some((item) => item.id === defaultTenant)) return defaultTenant;
  return tenants.find((item) => item.id === remembered)?.id ?? tenants[0]?.id ?? null;
}
