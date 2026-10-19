import { describe, expect, it, vi } from "vitest";
import { CLIENT_ID, ISSUER, discoveryDocument, idToken, json, memoryStore, mockIdp } from "../../../test/helpers";
import { beginAuthorization, completeAuthorization, discover, endSessionUrl, refreshTokens, revokeRefreshToken, type OidcConfig } from "./oidc";
import { STORAGE_KEYS } from "./storage";

/**
 * Ways the authorization code + PKCE flow can fail, each asserted below:
 *   O1 the authorization request lacks PKCE (S256 challenge), state, nonce, or the scopes/audience it was configured with
 *   O2 the challenge does not belong to the verifier that the code exchange later sends
 *   O3 a callback with another state (CSRF), an IdP error, or no login in progress is accepted
 *   O4 an ID token with the wrong nonce, issuer or audience is accepted
 *   O5 a callback can be replayed
 *   O6 a refresh drops the refresh token, or ignores a rotated one
 */

const REDIRECT = "https://app.example/auth/callback";
const NOW = 1_800_000_000_000;
const config: OidcConfig = { mode: "oidc", issuer: ISSUER, client_id: CLIENT_ID, scopes: ["profile", "email"], audience: "orbit-api" };

const tokenResponse = (nonce: string, extra: Record<string, unknown> = {}) =>
  json({ access_token: "access-1", token_type: "Bearer", expires_in: 600, refresh_token: "refresh-1", id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, nonce, now: NOW }), ...extra });

/** Starts a login and returns the callback URL the IdP would send the browser to. */
async function startLogin(overrides: { state?: string; query?: string } = {}) {
  const store = memoryStore();
  const idp = mockIdp(() => {
    throw new Error("token endpoint not expected");
  });
  const as = await discover(config, { fetch: idp.fetch });
  const authorizationUrl = await beginAuthorization(as, config, REDIRECT, "/sessions/s1", store);
  const params = authorizationUrl.searchParams;
  const callback = new URL(REDIRECT);
  callback.search = overrides.query ?? new URLSearchParams({ code: "code-1", state: overrides.state ?? params.get("state")! }).toString();
  return { store, as, authorizationUrl, params, callback };
}

describe("beginAuthorization (O1, O2)", () => {
  it("builds a PKCE authorization-code request", async () => {
    const { authorizationUrl, params } = await startLogin();
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(discoveryDocument.authorization_endpoint);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe(CLIENT_ID);
    expect(params.get("redirect_uri")).toBe(REDIRECT);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get("state")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(params.get("nonce")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(params.get("audience")).toBe("orbit-api");
  });

  it("always asks for openid, on top of the configured scopes", async () => {
    expect((await startLogin()).params.get("scope")).toBe("openid profile email");
  });

  it("defaults the scopes when the config has none, and keeps openid from appearing twice", async () => {
    const store = memoryStore();
    const idp = mockIdp(() => json({}));
    const as = await discover(config, { fetch: idp.fetch });
    const bare = await beginAuthorization(as, { ...config, scopes: undefined, audience: undefined }, REDIRECT, "/", store);
    expect(bare.searchParams.get("scope")).toBe("openid profile email");
    expect(bare.searchParams.has("audience")).toBe(false);
    const explicit = await beginAuthorization(as, { ...config, scopes: ["openid", "offline_access"] }, REDIRECT, "/", store);
    expect(explicit.searchParams.get("scope")).toBe("openid offline_access");
  });

  it("makes a fresh state, nonce and verifier for every login", async () => {
    const a = await startLogin();
    const b = await startLogin();
    expect(a.params.get("state")).not.toBe(b.params.get("state"));
    expect(a.params.get("nonce")).not.toBe(b.params.get("nonce"));
    expect(a.params.get("code_challenge")).not.toBe(b.params.get("code_challenge"));
  });

  it("keeps the verifier that the challenge was made from", async () => {
    const { store, params } = await startLogin();
    const pending = JSON.parse(store.getItem(STORAGE_KEYS.oidcPending)!) as { codeVerifier: string; state: string; nonce: string; returnTo: string };
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.codeVerifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(params.get("code_challenge")).toBe(challenge);
    expect(pending).toMatchObject({ state: params.get("state"), nonce: params.get("nonce"), returnTo: "/sessions/s1" });
  });
});

describe("discover", () => {
  it("rejects a discovery document of another issuer", async () => {
    const wrong = async () => json({ ...discoveryDocument, issuer: "https://evil.example" });
    await expect(discover(config, { fetch: wrong as typeof fetch })).rejects.toThrow();
  });
});

describe("completeAuthorization (O2-O5)", () => {
  it("exchanges the code with the stored verifier and returns the tokens and where to go next", async () => {
    const { store, as, params, callback } = await startLogin();
    const verifier = (JSON.parse(store.getItem(STORAGE_KEYS.oidcPending)!) as { codeVerifier: string }).codeVerifier;
    const idp = mockIdp((request) => tokenResponse(params.get("nonce")!, { sent: request.params.get("code") }));
    const result = await completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch, now: () => NOW });

    expect(idp.tokenRequests).toHaveLength(1);
    const sent = idp.tokenRequests[0].params;
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-1");
    expect(sent.get("code_verifier")).toBe(verifier);
    expect(sent.get("redirect_uri")).toBe(REDIRECT);
    expect(sent.get("client_id")).toBe(CLIENT_ID);
    expect(result.returnTo).toBe("/sessions/s1");
    expect(result.tokens).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW + 600_000 });
    expect(result.tokens.idToken).toBeTruthy();
  });

  it("refuses a callback whose state is not the one it sent, before asking the IdP for anything (O3)", async () => {
    const { store, as, callback } = await startLogin({ state: "forged-state" });
    const idp = mockIdp(() => tokenResponse("whatever"));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow();
    expect(idp.tokenRequests).toHaveLength(0);
  });

  it("refuses a callback without a state", async () => {
    const { store, as, callback } = await startLogin({ query: "code=code-1" });
    const idp = mockIdp(() => tokenResponse("whatever"));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow();
    expect(idp.tokenRequests).toHaveLength(0);
  });

  it("surfaces an error answer from the IdP", async () => {
    const { store, as, params } = await startLogin();
    const callback = new URL(`${REDIRECT}?error=access_denied&error_description=no&state=${params.get("state")}`);
    const idp = mockIdp(() => tokenResponse("x"));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow("身份服务拒绝了登录：no");
    expect(idp.tokenRequests).toHaveLength(0);
  });

  it("refuses a callback when no login is in progress", async () => {
    const { as, callback } = await startLogin();
    const idp = mockIdp(() => tokenResponse("x"));
    await expect(completeAuthorization(as, config, REDIRECT, callback, memoryStore(), { fetch: idp.fetch })).rejects.toThrow("没有进行中的登录请求");
  });

  it("refuses an ID token with another nonce (O4)", async () => {
    const { store, as, callback } = await startLogin();
    const idp = mockIdp(() => tokenResponse("a-different-nonce"));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch, now: () => NOW })).rejects.toThrow();
  });

  it("refuses an ID token issued to another client or by another issuer (O4)", async () => {
    for (const claims of [{ iss: ISSUER, aud: "someone-else" }, { iss: "https://evil.example", aud: CLIENT_ID }]) {
      const { store, as, params, callback } = await startLogin();
      const idp = mockIdp(() => json({ access_token: "a", token_type: "Bearer", expires_in: 60, id_token: idToken({ ...claims, nonce: params.get("nonce")!, now: Date.now() }) }));
      await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow();
    }
  });

  it("refuses a response without an ID token, since the nonce could not be checked (O4)", async () => {
    const { store, as, callback } = await startLogin();
    const idp = mockIdp(() => json({ access_token: "a", token_type: "Bearer", expires_in: 60 }));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow();
  });

  it("cannot be replayed: the pending login is used up (O5)", async () => {
    const { store, as, params, callback } = await startLogin();
    const idp = mockIdp(() => tokenResponse(params.get("nonce")!));
    await completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch, now: () => NOW });
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch, now: () => NOW })).rejects.toThrow("没有进行中的登录请求");
    expect(idp.tokenRequests).toHaveLength(1);
  });

  it("uses the pending login up even when the exchange fails (O5)", async () => {
    const { store, as, callback } = await startLogin();
    const idp = mockIdp(() => json({ error: "invalid_grant" }, 400));
    await expect(completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch })).rejects.toThrow();
    expect(store.getItem(STORAGE_KEYS.oidcPending)).toBeNull();
  });

  it("assumes a short lifetime when the IdP says none", async () => {
    const { store, as, params, callback } = await startLogin();
    const idp = mockIdp(() => json({ access_token: "a", token_type: "Bearer", id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, nonce: params.get("nonce")!, now: NOW }) }));
    const { tokens } = await completeAuthorization(as, config, REDIRECT, callback, store, { fetch: idp.fetch, now: () => NOW });
    expect(tokens.expiresAt).toBe(NOW + 300_000);
    expect(tokens.refreshToken).toBeUndefined();
  });
});

describe("refreshTokens (O6)", () => {
  const current = { accessToken: "old", expiresAt: 0, refreshToken: "refresh-1", idToken: "id-1" };

  it("keeps the refresh token and ID token when the IdP does not rotate them", async () => {
    const idp = mockIdp(() => json({ access_token: "new", token_type: "Bearer", expires_in: 300 }));
    const as = await discover(config, { fetch: idp.fetch });
    const next = await refreshTokens(as, config, current, { fetch: idp.fetch, now: () => NOW });
    expect(idp.tokenRequests[0].params.get("grant_type")).toBe("refresh_token");
    expect(idp.tokenRequests[0].params.get("refresh_token")).toBe("refresh-1");
    expect(next).toEqual({ accessToken: "new", expiresAt: NOW + 300_000, refreshToken: "refresh-1", idToken: "id-1" });
  });

  it("takes a rotated refresh token", async () => {
    const idp = mockIdp(() => json({ access_token: "new", token_type: "Bearer", expires_in: 300, refresh_token: "refresh-2" }));
    const as = await discover(config, { fetch: idp.fetch });
    expect((await refreshTokens(as, config, current, { fetch: idp.fetch, now: () => NOW })).refreshToken).toBe("refresh-2");
  });

  it("fails when the IdP refuses the refresh token", async () => {
    const idp = mockIdp(() => json({ error: "invalid_grant" }, 400));
    const as = await discover(config, { fetch: idp.fetch });
    await expect(refreshTokens(as, config, current, { fetch: idp.fetch })).rejects.toThrow();
  });
});

describe("endSessionUrl", () => {
  it("points at the IdP's end-session endpoint with the ID token as hint", () => {
    const url = endSessionUrl(discoveryDocument, config, { accessToken: "a", expiresAt: 0, idToken: "id-1" }, "https://app.example/login")!;
    expect(`${url.origin}${url.pathname}`).toBe(discoveryDocument.end_session_endpoint);
    expect(url.searchParams.get("id_token_hint")).toBe("id-1");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example/login");
  });

  it("is null when the IdP has none", () => {
    expect(endSessionUrl({ issuer: ISSUER }, config, null, "https://app.example/login")).toBeNull();
  });
});

// HTTP is for local development only; logout should revoke refresh credentials when advertised.
describe("OIDC local issuer and revocation", () => {
  it("supports HTTP localhost discovery and refresh", async () => {
    const local = { ...config, issuer: "http://localhost:8080" };
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes("well-known")
      ? json({ issuer: local.issuer, token_endpoint: `${local.issuer}/token` })
      : json({ access_token: "local", token_type: "Bearer", expires_in: 600 }));
    const as = await discover(local, { fetch });
    expect((await refreshTokens(as, local, { accessToken: "old", refreshToken: "r", expiresAt: 0 }, { fetch })).accessToken).toBe("local");
  });

  it("refuses remote HTTP issuers in a production build", async () => {
    vi.stubEnv("DEV", false);
    try {
      await expect(discover({ ...config, issuer: "http://remote.example" }, { fetch: async () => json({}) })).rejects.toThrow();
    } finally { vi.unstubAllEnvs(); }
  });

  it("revokes a refresh token with its type hint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    await revokeRefreshToken({ ...discoveryDocument, revocation_endpoint: `${ISSUER}/revoke` }, config, { accessToken: "a", refreshToken: "r", expiresAt: 0 }, { fetch });
    expect(fetch).toHaveBeenCalledOnce();
    const params = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));
    expect(params.get("token")).toBe("r");
    expect(params.get("token_type_hint")).toBe("refresh_token");
  });
});
