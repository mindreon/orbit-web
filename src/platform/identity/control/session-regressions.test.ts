import { describe, expect, it, vi } from "vitest";
import { AuthController } from "./controller";
import { STORAGE_KEYS } from "./storage";
import { CLIENT_ID, ISSUER, idToken, json, memoryStore, mockIdp } from "../../../test/helpers";

// Failure modes: a late renewal resurrects logout/401; stale tenant survives 401;
// logout triggers automatic login; StrictMode starts two authorization requests.
describe("session regressions", () => {
  async function session() {
    let finishRefresh!: (response: Response) => void;
    let refreshStarted!: () => void;
    const refreshing = new Promise<void>((resolve) => { refreshStarted = resolve; });
    let nonce = "";
    let now = Date.now();
    const idp = mockIdp(({ params }) => {
      if (params.get("grant_type") === "refresh_token") {
        refreshStarted();
        return new Promise<Response>((resolve) => { finishRefresh = resolve; });
      }
      return json({ access_token: "a", token_type: "Bearer", expires_in: 60, refresh_token: "r", id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, nonce, now }) });
    });
    const store = memoryStore();
    const redirect = vi.fn();
    const deps = { loadConfig: async () => ({ mode: "oidc" as const, issuer: ISSUER, client_id: CLIENT_ID }), requestDevToken: async () => ({ access_token: "dev", expires_in: 60 }), store, redirect, origin: "https://app.example", currentPath: () => "/me", fetch: idp.fetch, now: () => now };
    const controller = new AuthController(deps);
    await controller.initialize();
    await Promise.all([controller.login("/me"), controller.login("/me")]);
    expect(redirect).toHaveBeenCalledTimes(1);
    const url = new URL(redirect.mock.calls[0][0]);
    nonce = url.searchParams.get("nonce")!;
    await controller.completeLogin(`https://app.example/auth/callback?code=c&state=${url.searchParams.get("state")}`);
    now += 40_000;
    return { controller, deps, refreshing, finish: () => finishRefresh(json({ access_token: "resurrected", token_type: "Bearer", expires_in: 600 })), store, redirect };
  }

  it.each(["logout", "unauthorized"] as const)("does not resurrect a session after %s during renewal", async (action) => {
    const s = await session();
    const token = s.controller.token();
    await s.refreshing;
    await s.controller[action]();
    s.finish();
    expect(await token).toBeNull();
    expect(s.controller.getSnapshot().status).toBe("anonymous");
  });

  it("clears tenant selection on unauthorized", async () => {
    const s = await session();
    s.controller.setTenant("stale");
    s.controller.unauthorized();
    expect(s.controller.tenant()).toBeNull();
    expect(s.store.getItem(STORAGE_KEYS.tenant)).toBeNull();
  });

  it("blocks auto login after explicit logout, consuming the marker on the next page load", async () => {
    const s = await session();
    await s.controller.logout();
    const count = s.redirect.mock.calls.length;
    await s.controller.autoLogin("/me");
    expect(s.redirect).toHaveBeenCalledTimes(count);
    const reloaded = new AuthController(s.deps);
    await reloaded.initialize();
    await reloaded.autoLogin("/me");
    expect(s.redirect).toHaveBeenCalledTimes(count);
    const nextVisit = new AuthController(s.deps);
    await nextVisit.initialize();
    await nextVisit.autoLogin("/me");
    expect(s.redirect).toHaveBeenCalledTimes(count + 1);
  });
});
