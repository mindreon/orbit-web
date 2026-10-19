// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthValue } from "./context";
import { AuthContext, useAuth } from "./context";
import { AuthController } from "./controller";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";
import { AuthCallbackPage } from "./AuthCallbackPage";
import { LoginPage } from "./LoginPage";
import { qk } from "../../queryKeys";
import { CLIENT_ID, ISSUER, idToken, json, memoryStore, mockIdp } from "../../../test/helpers";

const state = vi.hoisted(() => ({ auth: null as unknown as AuthController, get: vi.fn() }));
vi.mock("../../client", () => ({ api: { get: state.get } }));
vi.mock("./adapter", () => ({ get auth() { return state.auth; } }));

const me = { principal: { id: "u1", kind: "user", email: "a@b.c", display_name: "A" }, tenants: [{ id: "t1", name: "One", slug: "one" }, { id: "t2", name: "Two", slug: "two" }], current_tenant: "t1", roles: ["owner"] };
const oidc = { mode: "oidc" as const, issuer: ISSUER, client_id: CLIENT_ID };
const base = (): AuthValue => ({ status: "anonymous", config: { mode: "dev" }, error: null, principal: null, tenants: [], currentTenant: null, roles: [], login: vi.fn(async () => undefined), loginDev: vi.fn(async () => undefined), switchTenant: vi.fn(), logout: vi.fn(async () => undefined), retry: vi.fn() });
let current!: AuthValue;
function Profile() { current = useAuth(); return <div>{current.status}:{current.principal?.display_name}:{current.currentTenant?.id}:{current.error}</div>; }
function Location() { const location = useLocation(); return <div>{location.pathname}{location.search}{location.hash}:{(location.state as { from?: string })?.from}</div>; }

beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  // WebCrypto returns Node-realm buffers; oauth4webapi uses instanceof ArrayBuffer.
  vi.stubGlobal("ArrayBuffer", (await webcrypto.subtle.digest("SHA-256", new Uint8Array())).constructor);
  state.get.mockReset();
  state.auth = new AuthController({ loadConfig: async () => ({ mode: "dev" }), requestDevToken: async () => ({ access_token: "dev", expires_in: 3600 }), store: memoryStore(), redirect: vi.fn(), origin: "https://app.example", currentPath: () => "/me" });
});
afterEach(cleanup);

// Failure modes: profile is exposed early, failures keep loading, tenant switch leaks cached data/in-flight responses.
describe("AuthProvider", () => {
  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuthProvider><Profile /></AuthProvider></QueryClientProvider>);
    return client;
  }

  it("maps config/profile loading, anonymous and ready states", async () => {
    let finish!: (value: unknown) => void;
    state.get.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount();
    expect(current.status).toBe("loading");
    await waitFor(() => expect(current.status).toBe("anonymous"));
    await act(() => state.auth.loginDev({ email: "a@b.c" }));
    expect(current.status).toBe("loading");
    await act(async () => { finish(me); });
    await waitFor(() => expect(current.status).toBe("ready"));
    expect(current.principal?.id).toBe("u1");
    expect(current.currentTenant?.id).toBe("t1");
  });

  it("maps profile rejection to failed and supports retry", async () => {
    state.get.mockRejectedValue(new Error("offline"));
    mount();
    await act(() => state.auth.loginDev({ email: "a@b.c" }));
    await waitFor(() => expect(current.status).toBe("failed"));
    expect(current.error).toContain("offline");
    state.get.mockResolvedValue(me);
    await act(async () => current.retry());
    await waitFor(() => expect(current.status).toBe("ready"));
  });

  it("clears all old tenant queries and cancels pending requests before switching", async () => {
    state.get.mockResolvedValue(me);
    const client = mount();
    await act(() => state.auth.loginDev({ email: "a@b.c" }));
    await waitFor(() => expect(current.status).toBe("ready"));
    client.setQueryData(["private", "t1"], "secret");
    let oldSignal!: AbortSignal;
    void client.fetchQuery({ queryKey: qk.me("t1"), queryFn: ({ signal }) => { oldSignal = signal; return new Promise(() => undefined); } }).catch(() => undefined);
    state.get.mockResolvedValue({ ...me, current_tenant: "t2" });
    act(() => current.switchTenant("t2"));
    expect(client.getQueryData(["private", "t1"])).toBeUndefined();
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(current.currentTenant?.id).toBe("t2"));
    expect(client.getQueryData(["me", null])).toBeUndefined();
  });
});

// Guards must preserve return paths and never render protected content before ready.
describe("RequireAuth", () => {
  function mount(value: AuthValue) {
    return render(<AuthContext.Provider value={value}><MemoryRouter initialEntries={["/private?q=1#tail"]}><Routes><Route path="/login" element={<Location />} /><Route element={<RequireAuth />}><Route path="/private" element={<div>protected</div>} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
  }
  it("redirects anonymous with pathname, query and hash", async () => {
    mount(base());
    expect(await screen.findByText("/login:/private?q=1#tail")).toBeTruthy();
    expect(screen.queryByText("protected")).toBeNull();
  });
  it.each(["loading", "failed"] as const)("blocks protected UI while %s", (status) => {
    const value = { ...base(), status, error: "failure" };
    mount(value);
    expect(screen.queryByText("protected")).toBeNull();
    if (status === "failed") { fireEvent.click(screen.getByText("重试")); expect(value.retry).toHaveBeenCalledOnce(); }
  });
  it("renders the protected outlet when ready", () => { mount({ ...base(), status: "ready" }); expect(screen.getByText("protected")).toBeTruthy(); });
});

describe("login and callback pages", () => {
  it("auto logs in once in StrictMode and restores the button after a swallowed failure", async () => {
    const login = vi.fn(async () => undefined);
    const autoLogin = vi.spyOn(state.auth, "autoLogin").mockResolvedValue(undefined);
    const value = { ...base(), config: oidc, login };
    render(<StrictMode><AuthContext.Provider value={value}><MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/private" } }]}><LoginPage /></MemoryRouter></AuthContext.Provider></StrictMode>);
    await waitFor(() => expect(autoLogin).toHaveBeenCalledExactlyOnceWith("/private"));
    const button = screen.getByText("使用企业账号登录") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(login).toHaveBeenCalledTimes(2);
  });

  it("does not auto login when an error is displayed", () => {
    const autoLogin = vi.spyOn(state.auth, "autoLogin");
    render(<AuthContext.Provider value={{ ...base(), config: oidc, error: "denied" }}><MemoryRouter><LoginPage /></MemoryRouter></AuthContext.Provider>);
    expect(autoLogin).not.toHaveBeenCalled();
  });

  it("displays config failures on the callback and offers retry", () => {
    const value = { ...base(), config: null, error: "config failed" };
    render(<AuthContext.Provider value={value}><MemoryRouter><AuthCallbackPage /></MemoryRouter></AuthContext.Provider>);
    expect(screen.getByText("config failed")).toBeTruthy();
    fireEvent.click(screen.getByText("重试"));
    expect(value.retry).toHaveBeenCalledOnce();
  });

  it("redeems the callback only once under StrictMode and navigates to the saved path", async () => {
    let nonce = "";
    const redirect = vi.fn();
    const idp = mockIdp(() => json({ access_token: "a", token_type: "Bearer", expires_in: 600, id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, nonce, now: Date.now() }) }));
    state.auth = new AuthController({ loadConfig: async () => oidc, requestDevToken: vi.fn(), store: memoryStore(), redirect, origin: window.location.origin, currentPath: () => "/me", fetch: idp.fetch });
    await state.auth.initialize();
    await state.auth.login("/private");
    expect(state.auth.getSnapshot().error).toBeNull();
    const request = new URL(redirect.mock.calls[0][0]);
    nonce = request.searchParams.get("nonce")!;
    window.history.replaceState({}, "", `/auth/callback?code=c&state=${request.searchParams.get("state")}`);
    render(<StrictMode><AuthContext.Provider value={{ ...base(), config: oidc }}><MemoryRouter initialEntries={["/auth/callback"]}><Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="/private" element={<div>arrived</div>} /></Routes></MemoryRouter></AuthContext.Provider></StrictMode>);
    expect(await screen.findByText("arrived")).toBeTruthy();
    expect(idp.tokenRequests).toHaveLength(1);
  });
});
