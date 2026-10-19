import { describe, expect, it, vi } from "vitest";
import type { AuthConfig } from "../../../api/auth";
import { ApiError } from "../../../api/errors";
import { CLIENT_ID, ISSUER, idToken, json, memoryStore, mockIdp } from "../../../test/helpers";
import { AuthController, type AuthDeps } from "./controller";
import { STORAGE_KEYS } from "./storage";

/**
 * Ways the session can fail, each asserted below:
 *   D1 dev mode: the token is not sent, is lost on reload, or outlives its expiry or the logout
 *   D2 oidc: the tokens are written to storage (they must stay in memory)
 *   D3 oidc: a callback is exchanged twice (StrictMode), or the login does not come back to where the person was
 *   D4 a token about to expire is used as is, or two requests renew it at once
 *   D5 a revoked refresh token or a 401 leaves the person stuck instead of signing in again
 *   D6 control rejecting a fresh login sends the browser round the IdP in a loop
 *   D7 logout leaves the IdP session (the next login would silently succeed), the dev session or the tokens behind
 *   D8 the snapshot changes identity without changing content, or listeners are not told
 */

const NOW = 1_800_000_000_000;
const DEV: AuthConfig = { mode: "dev" };
const OIDC: AuthConfig = { mode: "oidc", issuer: ISSUER, client_id: CLIENT_ID, scopes: ["offline_access"] };

function setup(config: AuthConfig, overrides: Partial<AuthDeps> = {}) {
  const clock = { now: NOW };
  const store = memoryStore();
  const redirect = vi.fn<(url: string) => void>();
  const requestDevToken = vi.fn(async () => ({ access_token: "dev-1", expires_in: 3600 }));
  const deps: AuthDeps = {
    loadConfig: async () => config,
    requestDevToken,
    store,
    redirect,
    origin: "https://app.example",
    currentPath: () => "/sessions/s1?tab=files",
    now: () => clock.now,
    ...overrides,
  };
  return { controller: new AuthController(deps), deps, clock, store, redirect, requestDevToken };
}

describe("dev mode (D1)", () => {
  it("starts anonymous, signs in through the dev issuer and sends the token", async () => {
    const { controller, requestDevToken } = setup(DEV);
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ status: "anonymous", config: DEV });
    expect(await controller.token()).toBeNull();

    await controller.loginDev({ email: "a@b.c", display_name: "A" });
    expect(requestDevToken).toHaveBeenCalledWith({ email: "a@b.c", display_name: "A" });
    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(await controller.token()).toBe("dev-1");
  });

  it("lets the ApiError of a refused login reach the caller and stays anonymous", async () => {
    const refusal = new ApiError(400, { code: "INVALID_EMAIL", message: "邮箱不对", retryable: false });
    const { controller } = setup(DEV, { requestDevToken: async () => Promise.reject(refusal) });
    await controller.initialize();
    await expect(controller.loginDev({ email: "x" })).rejects.toBe(refusal);
    expect(controller.getSnapshot().status).toBe("anonymous");
  });

  it("survives a reload in this tab (sessionStorage) until the token expires", async () => {
    const first = setup(DEV);
    await first.controller.initialize();
    await first.controller.loginDev({ email: "a@b.c" });

    const reloaded = new AuthController({ ...first.deps });
    await reloaded.initialize();
    expect(reloaded.getSnapshot().status).toBe("authenticated");
    expect(await reloaded.token()).toBe("dev-1");

    first.clock.now += 3600_000 - 10_000; // inside the renewal margin
    const late = new AuthController({ ...first.deps });
    await late.initialize();
    expect(late.getSnapshot().status).toBe("anonymous");
    expect(first.store.getItem(STORAGE_KEYS.devSession)).toBeNull();
  });

  it("ignores a damaged saved session", async () => {
    const { controller, store } = setup(DEV);
    store.setItem(STORAGE_KEYS.devSession, "{not json");
    await controller.initialize();
    expect(controller.getSnapshot().status).toBe("anonymous");
    expect(store.getItem(STORAGE_KEYS.devSession)).toBeNull();
  });

  it("forgets everything on logout", async () => {
    const { controller, store } = setup(DEV);
    await controller.initialize();
    await controller.loginDev({ email: "a@b.c" });
    controller.setTenant("t-2");
    await controller.logout();
    expect(controller.getSnapshot()).toMatchObject({ status: "anonymous", tenantId: null });
    expect(await controller.token()).toBeNull();
    expect([...store.entries.keys()]).toEqual([]);
  });

  it("signs out with a message when the token expires or control rejects it", async () => {
    const { controller, store, redirect } = setup(DEV);
    await controller.initialize();
    await controller.loginDev({ email: "a@b.c" });
    controller.unauthorized();
    expect(controller.getSnapshot()).toMatchObject({ status: "anonymous", error: "登录已过期，请重新登录。" });
    expect(store.getItem(STORAGE_KEYS.devSession)).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("signs out when the token has run out and cannot be renewed", async () => {
    const { controller, clock } = setup(DEV);
    await controller.initialize();
    await controller.loginDev({ email: "a@b.c" });
    clock.now += 3600_001;
    expect(await controller.token()).toBeNull();
    expect(controller.getSnapshot().status).toBe("anonymous");
  });

  it("explains a login config it could not read", async () => {
    const { controller } = setup(DEV, { loadConfig: async () => Promise.reject(new TypeError("down")) });
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ status: "anonymous", config: null });
    expect(controller.getSnapshot().error).toContain("读取登录配置失败");
  });
});

describe("tenant", () => {
  it("remembers the selected tenant for this tab and reports it to the API client", () => {
    const { controller, store } = setup(DEV);
    expect(controller.tenant()).toBeNull();
    controller.setTenant("t-2");
    expect(controller.tenant()).toBe("t-2");
    expect(store.getItem(STORAGE_KEYS.tenant)).toBe("t-2");
    expect(new AuthController({ ...setup(DEV).deps, store }).tenant()).toBe("t-2");
  });
});

describe("snapshot (D8)", () => {
  it("keeps one object until something changes, and tells subscribers when it does", async () => {
    const { controller } = setup(DEV);
    const listener = vi.fn();
    const stop = controller.subscribe(listener);
    const before = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(before);
    await controller.initialize();
    expect(controller.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    stop();
    controller.setTenant("t-9");
    expect(listener.mock.calls.length).toBe(calls);
  });
});

// ---- oidc ------------------------------------------------------------------------------------------------------------------

/** An OIDC controller wired to a fake IdP; `signIn` plays the whole redirect round trip and returns the continue-at path. */
async function oidc(options: { expiresIn?: number; refreshToken?: string | null; refresh?: () => Response } = {}) {
  let nonce = "";
  const idp = mockIdp(({ params }) => {
    if (params.get("grant_type") === "refresh_token") return options.refresh ? options.refresh() : json({ access_token: "access-2", token_type: "Bearer", expires_in: 600, refresh_token: "refresh-2" });
    return json({
      access_token: "access-1",
      token_type: "Bearer",
      expires_in: options.expiresIn ?? 600,
      ...(options.refreshToken === null ? {} : { refresh_token: options.refreshToken ?? "refresh-1" }),
      id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, nonce, now: NOW }),
    });
  });
  const s = setup(OIDC, { fetch: idp.fetch });
  await s.controller.initialize();

  async function signIn(): Promise<string> {
    await s.controller.login("/sessions/s1");
    const authorization = new URL(s.redirect.mock.calls.at(-1)![0]);
    nonce = authorization.searchParams.get("nonce")!;
    const callback = `https://app.example/auth/callback?code=c1&state=${authorization.searchParams.get("state")}`;
    return s.controller.completeLogin(callback);
  }
  return { ...s, idp, signIn };
}

describe("oidc login (D2, D3)", () => {
  it("goes to the IdP with a PKCE request, comes back and continues where the person was going", async () => {
    const { controller, redirect, signIn } = await oidc();
    expect(controller.getSnapshot().status).toBe("anonymous");
    const returnTo = await signIn();

    const authorization = new URL(redirect.mock.calls[0][0]);
    expect(authorization.searchParams.get("redirect_uri")).toBe("https://app.example/auth/callback");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(returnTo).toBe("/sessions/s1");
    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(await controller.token()).toBe("access-1");
  });

  it("keeps the tokens out of storage", async () => {
    const { store, signIn } = await oidc();
    await signIn();
    expect(JSON.stringify([...store.entries.entries()])).not.toMatch(/access-1|refresh-1|id_token|eyJ/);
    expect(store.getItem(STORAGE_KEYS.devSession)).toBeNull();
  });

  it("exchanges one callback once however often it is asked", async () => {
    const { controller, redirect, idp, signIn } = await oidc();
    await signIn();
    const callback = `https://app.example/auth/callback?code=c1&state=${new URL(redirect.mock.calls[0][0]).searchParams.get("state")}`;
    await expect(Promise.all([controller.completeLogin(callback), controller.completeLogin(callback)])).resolves.toEqual(["/sessions/s1", "/sessions/s1"]);
    expect(idp.tokenRequests).toHaveLength(1);
  });

  it("stays anonymous when the callback is refused", async () => {
    const { controller } = await oidc();
    await expect(controller.completeLogin("https://app.example/auth/callback?code=c1&state=forged")).rejects.toThrow("没有进行中的登录请求");
    expect(controller.getSnapshot().status).toBe("anonymous");
  });

  it("reuses one discovery for the whole session", async () => {
    const { idp, signIn, controller } = await oidc();
    await signIn();
    await controller.logout();
    expect(idp.discoveries()).toBe(1);
  });
});

describe("oidc renewal (D4, D5)", () => {
  it("uses the token as it is while it has time left", async () => {
    const { controller, idp, signIn, clock } = await oidc();
    await signIn();
    clock.now += 500_000;
    expect(await controller.token()).toBe("access-1");
    expect(idp.tokenRequests).toHaveLength(1);
  });

  it("renews with the refresh token before the access token runs out, once for concurrent requests", async () => {
    const { controller, idp, signIn, clock } = await oidc();
    await signIn();
    clock.now += 580_000;
    const tokens = await Promise.all([controller.token(), controller.token(), controller.token()]);
    expect(tokens).toEqual(["access-2", "access-2", "access-2"]);
    expect(idp.tokenRequests.filter((r) => r.params.get("grant_type") === "refresh_token")).toHaveLength(1);
    expect(idp.tokenRequests.at(-1)!.params.get("refresh_token")).toBe("refresh-1");
  });

  it("signs in again, back where the person was, when the refresh token is refused", async () => {
    const { controller, redirect, signIn, clock, store } = await oidc({ refresh: () => json({ error: "invalid_grant" }, 400) });
    await signIn();
    clock.now += 31_000_000; // well after the login-loop window
    expect(await controller.token()).toBeNull();
    expect(controller.getSnapshot().status).toBe("anonymous");
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledTimes(2));
    expect(JSON.parse(store.getItem(STORAGE_KEYS.oidcPending)!)).toMatchObject({ returnTo: "/sessions/s1?tab=files" });
  });

  it("signs in again when there is no refresh token and the access token has expired", async () => {
    const { controller, redirect, signIn, clock } = await oidc({ refreshToken: null });
    await signIn();
    clock.now += 601_000;
    expect(await controller.token()).toBeNull();
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledTimes(2));
  });

  it("goes to the IdP again on a 401, once however many requests fail together", async () => {
    const { controller, redirect, signIn, clock } = await oidc();
    await signIn();
    clock.now += 120_000;
    controller.unauthorized();
    controller.unauthorized();
    controller.unauthorized();
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledTimes(2));
    expect(controller.getSnapshot().status).toBe("anonymous");
  });
});

describe("oidc login loop (D6)", () => {
  it("does not send the browser back to the IdP when control rejects a token it has just issued", async () => {
    const { controller, redirect, signIn } = await oidc();
    await signIn();
    controller.unauthorized();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ status: "anonymous" });
    expect(controller.getSnapshot().error).toContain("不接受");
  });
});

describe("oidc logout (D7)", () => {
  it("ends the IdP session as well and forgets the tokens", async () => {
    const { controller, redirect, signIn, store } = await oidc();
    await signIn();
    await controller.logout();
    const end = new URL(redirect.mock.calls.at(-1)![0]);
    expect(end.origin + end.pathname).toBe(`${ISSUER}/logout`);
    expect(end.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example/login");
    expect(end.searchParams.get("id_token_hint")).toBeTruthy();
    expect(await controller.token()).toBeNull();
    expect(store.getItem(STORAGE_KEYS.oidcLoginAt)).toBeNull();
    expect(controller.getSnapshot().status).toBe("anonymous");
  });

  it("still signs out locally when the IdP cannot be reached", async () => {
    const s = setup(OIDC, { fetch: async () => Promise.reject(new TypeError("down")) });
    await s.controller.initialize();
    await s.controller.logout();
    expect(s.controller.getSnapshot().status).toBe("anonymous");
    expect(s.redirect).not.toHaveBeenCalled();
  });
});
