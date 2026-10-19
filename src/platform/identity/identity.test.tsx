// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../api/client";
import type { Me } from "../../api/types";
import { IdentityProvider, RequireIdentity, useIdentity, type IdentityAdapter } from "./index";
import { useTenantSelection } from "./context";
import { TenantGate } from "../tenancy/TenantGate";

afterEach(cleanup);
function memoryIdentity(status: "initializing" | "anonymous" | "authenticated" = "authenticated", remembered: string | null = null) {
  let state = { status, error: null };
  let tenant = remembered;
  const listeners = new Set<() => void>();
  const publish = (next: typeof status) => { state = { status: next, error: null }; listeners.forEach((listener) => listener()); };
  const adapter: IdentityAdapter = {
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => state,
    credentials: { token: () => "memory", tenant: () => tenant, unauthorized: () => { tenant = null; publish("anonymous"); } },
    initialize: async () => undefined,
    setTenant: vi.fn((id) => { tenant = id; listeners.forEach((listener) => listener()); }),
    signOut: async () => { tenant = null; publish("anonymous"); },
    SignInPage: () => <div>external sign in</div>,
  };
  return adapter;
}
const tenants = [{ id: "t1", name: "First", slug: "first" }, { id: "t2", name: "Second", slug: "second" }];
function Controls() { const value = useIdentity(); const switchTenant = useTenantSelection(); return <><div>protected:{value.currentTenant?.id}</div><button onClick={() => switchTenant("t2")}>switch</button><button onClick={() => void value.signOut()}>sign out</button></>; }
function mount(adapter: IdentityAdapter, memberships = tenants) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const requests: (string | null)[] = [];
  const client = createApiClient({ credentials: adapter.credentials, fetch: async (_url, init) => {
    const tenant = new Headers(init?.headers).get("X-Orbit-Tenant");
    requests.push(tenant);
    if (tenant && !memberships.some((item) => item.id === tenant)) return new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "not an active member", retryable: false } }), { status: 403 });
    return new Response(JSON.stringify({ principal: { id: "p", email: "a@b.c", display_name: "A", kind: "user" }, tenants: memberships, current_tenant: tenant, default_tenant: null, roles: [], platform_operator: false } satisfies Me), { headers: { "Content-Type": "application/json" } });
  } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/private"]}><IdentityProvider adapter={adapter} client={client}><Routes><Route path="/login" element={<div>login route</div>} /><Route element={<RequireIdentity />}><Route element={<TenantGate />}><Route path="/private" element={<Controls />} /></Route></Route></Routes></IdentityProvider></MemoryRouter></QueryClientProvider>);
  return { cache, requests };
}
describe("U14 adapter-independent identity flow", () => {
  it.each(["initializing", "anonymous"] as const)("never renders protected content while %s", async (status) => {
    mount(memoryIdentity(status));
    expect(screen.queryByText(/protected/)).toBeNull();
    if (status === "anonymous") expect(await screen.findByText("login route")).toBeTruthy();
  });
  it("blocks an unprovisioned account without redirecting or exposing account details", async () => {
    mount(memoryIdentity(), []);
    expect(await screen.findByText("账号尚未开通，请联系管理员")).toBeTruthy();
    expect(screen.queryByText(/protected|welcome route|刷新|复制账号/)).toBeNull();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });
  it.each([null, "stale", "t2"])("selects membership with remembered tenant %s", async (remembered) => {
    const adapter = memoryIdentity("authenticated", remembered);
    const { requests } = mount(adapter);
    expect(await screen.findByText(`protected:${remembered === "t2" ? "t2" : "t1"}`)).toBeTruthy();
    if (remembered === "stale") {
      expect(requests.slice(0, 3)).toEqual(["stale", null, "t1"]);
      expect(adapter.setTenant).toHaveBeenNthCalledWith(1, null);
    }
    if (remembered !== "t2") expect(adapter.setTenant).toHaveBeenCalledWith("t1");
  });
  it("cancels old cache on switch and clears it on external sign out", async () => {
    const { cache } = mount(memoryIdentity("authenticated", "t1"));
    await screen.findByText("protected:t1");
    cache.setQueryData(["t1", "private"], "secret");
    act(() => fireEvent.click(screen.getByText("switch")));
    expect(cache.getQueryData(["t1", "private"])).toBeUndefined();
    await screen.findByText("protected:t2");
    cache.setQueryData(["t2", "private"], "secret");
    fireEvent.click(screen.getByText("sign out"));
    await waitFor(() => expect(cache.getQueryData(["t2", "private"])).toBeUndefined());
    expect(await screen.findByText("login route")).toBeTruthy();
  });
});

it("does not expose the control controller through the API singleton", async () => {
  expect(Object.keys(await import("../client"))).toEqual(["api"]);
});
