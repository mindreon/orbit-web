// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { IdentityContext, TenantSelectionContext, type IdentityValue } from "../platform/identity/context";
import { AppLayout } from "./AppLayout";
import { MePage } from "./MePage";
import { TenantGate } from "../platform/tenancy/TenantGate";

vi.mock("../platform/useMediaQuery", () => ({ BREAKPOINT: { sm: "640px" }, useMediaQuery: () => true }));
vi.mock("../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w", name: "默认工作空间" }, workspaces: [{ id: "w", name: "默认工作空间" }], select: vi.fn() }) }));
vi.mock("../features/sessions", () => ({ RecentSessions: () => null }));
afterEach(cleanup);
const tenant = { id: "t", name: "Internal Tenant Name", slug: "internal" };
const identity = {
  status: "authenticated", principal: { id: "account-id", email: "user@example.test", display_name: "User", kind: "user" },
  tenants: [tenant], currentTenant: tenant, roles: [], signOut: vi.fn(), retry: vi.fn(),
} as unknown as IdentityValue;
it.each(["shell", "me", "unprovisioned"] as const)("does not render tenant vocabulary or names in %s", (page) => {
  const value = page === "unprovisioned" ? { ...identity, tenants: [], currentTenant: null } : identity;
  const { container } = render(<MemoryRouter><IdentityContext.Provider value={value}>{page === "shell" ? <AppLayout /> : page === "me" ? <MePage /> : <TenantSelectionContext.Provider value={vi.fn()}><TenantGate /></TenantSelectionContext.Provider>}</IdentityContext.Provider></MemoryRouter>);
  expect(container.textContent).not.toMatch(/租户|组织|Internal Tenant Name/);
  if (page === "shell") {
    expect(screen.getByRole("combobox", { name: "工作空间 默认工作空间" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "新建会话" }).getAttribute("href")).toBe("/sessions?new=");
  }
  if (page === "unprovisioned") {
    expect(screen.getByText("账号尚未开通，请联系管理员")).toBeTruthy();
    expect(screen.queryByText("account-id")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  }
});
