import { describe, expect, it } from "vitest";
import { qk } from "./queryKeys";
import { canNavigate, type NavigationPermission } from "./permissions";
import { selectTenant } from "./tenancy/selectTenant";

describe("U3 tenant selection", () => {
  it("selects remembered membership or first membership, never an invalid or absent tenant", () => {
    const tenants = [{ id: "first" }, { id: "second" }];
    expect(selectTenant([], null, "stale")).toBeNull();
    expect(selectTenant(tenants, null, "second")).toBe("second");
    expect(selectTenant(tenants, "removed", "second")).toBe("second");
    expect(selectTenant(tenants, null, "removed")).toBe("first");
    expect(selectTenant(tenants, "first", "second")).toBe("first");
  });
});
it("U9 uses only tenant roles and matches all five role navigation matrices", () => {
  const permissions: NavigationPermission[] = ["catalog", "inbox", "assets", "schedules", "reviews", "admin", "audit", "tenantUsage", "workspaceCreate"];
  const expected = {
    owner: [true, true, true, true, true, true, true, true, true],
    admin: [true, true, true, true, true, true, true, true, true],
    auditor: [true, true, true, true, false, false, true, true, false],
    reviewer: [true, true, true, true, true, false, false, false, false],
    member: [true, true, true, true, false, false, false, false, true],
  };
  for (const [role, matrix] of Object.entries(expected)) expect(permissions.map((permission) => canNavigate([`tenant.${role}`, "ws.admin", "asset.owner"], permission))).toEqual(matrix);
  expect(permissions.map((permission) => canNavigate(["ws.admin", "asset.owner", "session.owner"], permission))).toEqual([true, true, true, true, false, false, false, false, false]);
});
it("U10 scopes every factory key to the tenant as its first element", () => {
  for (const factory of Object.values(qk)) expect((factory as (...args: string[]) => readonly unknown[])("tenant", "resource", "detail")[0]).toBe("tenant");
});
