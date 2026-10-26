import type { AuthorizationServer } from "oauth4webapi";
import type { AuthConfig, DevTokenRequest, DevTokenResponse } from "../../../api/auth";
import type { Credentials } from "../../../api/client";
import { describeFailure } from "../../../api/errors";
import { BASE_PATH } from "../../../lib/basePath";
import { requireOidcConfig, beginAuthorization, completeAuthorization, discover, endSessionUrl, refreshTokens, revokeRefreshToken, type OidcConfig, type OidcOptions } from "./oidc";
import { STORAGE_KEYS, type KeyValueStore, type TokenSet } from "../storage";

export type AuthStatus = "initializing" | "anonymous" | "authenticated";

export interface AuthSnapshot {
  readonly status: AuthStatus;
  /** How this deployment signs people in; null until `/auth/config` answered. */
  readonly config: AuthConfig | null;
  /** The selected tenant id (`X-Orbit-Tenant`); null does not select a tenant; TenantGate chooses from /me.tenants. */
  readonly tenantId: string | null;
  /** Why the user is signed out or could not start, when that is not their own doing. */
  readonly error: string | null;
}

export interface AuthDeps {
  readonly loadConfig: () => Promise<AuthConfig>;
  readonly requestDevToken: (body: DevTokenRequest) => Promise<DevTokenResponse>;
  /** Per-tab storage; see the notes on persistence below. */
  readonly store: KeyValueStore;
  /** Leaves the app for another URL (the IdP). */
  readonly redirect: (url: string) => void;
  readonly origin: string;
  /** Where the user is now, to come back to after signing in again. */
  readonly currentPath: () => string;
  readonly now?: () => number;
  readonly fetch?: OidcOptions["fetch"];
}

/** Renew when the access token has less than this left. */
const RENEW_SKEW_MS = 30_000;
/** A 401 this soon after a successful login means control rejects what the IdP issues; signing in again would loop. */
const LOGIN_LOOP_WINDOW_MS = 30_000;
export const CALLBACK_PATH = "/auth/callback";
export const LOGIN_PATH = "/login";

/**
 * The browser-side session: who is signed in, with which token, for which tenant.
 *
 * Where tokens live. In `oidc` mode the access token (and refresh token, when the IdP grants one) exists only in this object's
 * memory, so a page reload goes through the authorization code flow again; the IdP's own session makes that invisible. Memory-only
 * is the point: nothing a script on the page can read after a reload. In `dev` mode there is no IdP session to fall back on, so a
 * reload would otherwise mean typing the email again on every refresh; the dev token is kept in sessionStorage (this tab only,
 * gone when it closes). That token is only ever issued by a control running with ORBIT_AUTH_MODE=dev, a mode for local stacks.
 */
export class AuthController implements Credentials {
  private snapshot: AuthSnapshot;
  private tokens: TokenSet | null = null;
  private server: Promise<AuthorizationServer> | null = null;
  private autoLoginBlocked: boolean;
  private loggingIn: Promise<void> | null = null;
  private renewing: Promise<void> | null = null;
  private callback: { url: string; result: Promise<string> } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? Date.now;
    this.autoLoginBlocked = deps.store.getItem(STORAGE_KEYS.loggedOut) !== null;
    deps.store.removeItem(STORAGE_KEYS.loggedOut);
    this.snapshot = { status: "initializing", config: null, tenantId: deps.store.getItem(STORAGE_KEYS.tenant), error: null };
  }

  // useSyncExternalStore contract: stable subscribe, and a snapshot object that changes identity only when its content does.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AuthSnapshot => this.snapshot;

  private update(patch: Partial<AuthSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Learns the login mode and, in dev mode, picks up the session of an earlier page load. */
  async initialize(): Promise<void> {
    this.update({ status: "initializing", error: null });
    let config: AuthConfig;
    try {
      config = await this.deps.loadConfig();
    } catch (error) {
      this.update({ status: "anonymous", error: describeFailure("读取登录配置失败", error) });
      return;
    }
    if (config.mode === "dev") this.tokens = this.readDevSession();
    this.update({ config, status: this.tokens ? "authenticated" : "anonymous" });
  }

  /** OIDC: sends the browser to the IdP. `returnTo` is where to land afterwards. */
  login(returnTo: string): Promise<void> {
    this.loggingIn ??= this.beginLogin(returnTo).finally(() => (this.loggingIn = null));
    return this.loggingIn;
  }

  /** Reloads can reuse the IdP session; an explicit logout suppresses this for the next page load. */
  async autoLogin(returnTo: string): Promise<void> {
    if (this.autoLoginBlocked || this.snapshot.status !== "anonymous" || this.snapshot.config?.mode !== "oidc" || this.snapshot.error) return;
    await this.login(returnTo);
  }

  private async beginLogin(returnTo: string): Promise<void> {
    const config = this.snapshot.config;
    if (config?.mode !== "oidc") throw new Error("当前部署不使用 OIDC 登录");
    this.autoLoginBlocked = false;
    this.deps.store.removeItem(STORAGE_KEYS.loggedOut);
    try {
      const url = await beginAuthorization(await this.authorizationServer(requireOidcConfig(config)), requireOidcConfig(config), this.redirectUri(), returnTo, this.deps.store);
      this.deps.redirect(url.toString());
    } catch (error) {
      this.update({ error: describeFailure("无法跳转到登录页", error) });
    }
  }

  /**
   * OIDC: handles the redirect back from the IdP and returns the path to continue at. The same callback URL is processed once even if
   * asked twice (React StrictMode runs effects twice; the authorization code can be redeemed only once).
   */
  completeLogin(callbackUrl: string): Promise<string> {
    if (this.callback?.url === callbackUrl) return this.callback.result;
    const result = this.exchange(callbackUrl);
    this.callback = { url: callbackUrl, result };
    return result;
  }

  private async exchange(callbackUrl: string): Promise<string> {
    const config = this.snapshot.config;
    if (config?.mode !== "oidc") throw new Error("当前部署不使用 OIDC 登录");
    const { tokens, returnTo } = await completeAuthorization(await this.authorizationServer(requireOidcConfig(config)), requireOidcConfig(config), this.redirectUri(), new URL(callbackUrl), this.deps.store, this.oidcOptions());
    this.tokens = tokens;
    this.deps.store.setItem(STORAGE_KEYS.oidcLoginAt, String(this.now()));
    this.update({ status: "authenticated", error: null });
    return returnTo;
  }

  /** Dev mode: asks control's built-in issuer for a token. Throws the ApiError when control refuses. */
  async loginDev(input: DevTokenRequest): Promise<void> {
    const response = await this.deps.requestDevToken(input);
    this.tokens = { accessToken: response.access_token, expiresAt: this.now() + response.expires_in * 1000 };
    this.deps.store.setItem(STORAGE_KEYS.devSession, JSON.stringify({ accessToken: this.tokens.accessToken, expiresAt: this.tokens.expiresAt }));
    this.update({ status: "authenticated", error: null });
  }

  async logout(): Promise<void> {
    const tokens = this.tokens;
    this.clearSession();
    this.deps.store.removeItem(STORAGE_KEYS.oidcLoginAt);
    this.deps.store.removeItem(STORAGE_KEYS.tenant);
    this.update({ status: "anonymous", error: null, tenantId: null });
    const config = this.snapshot.config;
    if (config?.mode !== "oidc") return;
    this.autoLoginBlocked = true;
    this.deps.store.setItem(STORAGE_KEYS.loggedOut, "1");
    // Ending the IdP session too, or the next "sign in" would silently sign the same user back in.
    const server = await this.authorizationServer(requireOidcConfig(config)).catch(() => null);
    if (server) await revokeRefreshToken(server, requireOidcConfig(config), tokens, this.oidcOptions()).catch(() => undefined);
    const url = server && endSessionUrl(server, requireOidcConfig(config), tokens, `${this.deps.origin}${BASE_PATH}${LOGIN_PATH}`);
    if (url) this.deps.redirect(url.toString());
  }

  setTenant(tenantId: string | null): void {
    if (tenantId) this.deps.store.setItem(STORAGE_KEYS.tenant, tenantId);
    else this.deps.store.removeItem(STORAGE_KEYS.tenant);
    this.update({ tenantId });
  }

  // ---- Credentials (what the API client calls) ----------------------------------------------------------------------------

  tenant = (): string | null => this.snapshot.tenantId;

  async token(): Promise<string | null> {
    const tokens = this.tokens;
    if (!tokens) return null;
    if (tokens.expiresAt - this.now() > RENEW_SKEW_MS) return tokens.accessToken;
    if (tokens.refreshToken) {
      await this.renew();
      return this.tokens?.accessToken ?? null;
    }
    if (tokens.expiresAt > this.now()) return tokens.accessToken;
    this.unauthorized();
    return null;
  }

  /** Control said 401, or the token ran out: signs out and, with an IdP, goes to sign in again where the user was. */
  unauthorized = (): void => {
    if (!this.tokens && this.snapshot.status !== "authenticated") return;
    const config = this.snapshot.config;
    const returnTo = this.deps.currentPath();
    const loop = this.justLoggedIn();
    this.clearSession();
    this.setTenant(null);
    if (config?.mode === "oidc" && !loop) {
      this.update({ status: "anonymous" });
      void this.login(returnTo);
      return;
    }
    this.update({
      status: "anonymous",
      error: config?.mode === "oidc" ? "登录成功，但服务端不接受身份服务签发的令牌，请联系管理员。" : "登录已过期，请重新登录。",
    });
  };

  // ---- internals ----------------------------------------------------------------------------------------------------------

  private renew(): Promise<void> {
    this.renewing ??= this.renewOnce().finally(() => (this.renewing = null));
    return this.renewing;
  }

  private async renewOnce(): Promise<void> {
    const config = this.snapshot.config;
    const tokens = this.tokens;
    if (config?.mode !== "oidc" || !tokens) return;
    try {
      const renewed = await refreshTokens(await this.authorizationServer(requireOidcConfig(config)), requireOidcConfig(config), tokens, this.oidcOptions());
      if (this.tokens === tokens) this.tokens = renewed;
    } catch {
      // Refresh token revoked or expired: the session is over, the same as a 401.
      if (this.tokens === tokens) this.unauthorized();
    }
  }

  private justLoggedIn(): boolean {
    const at = Number(this.deps.store.getItem(STORAGE_KEYS.oidcLoginAt));
    return Number.isFinite(at) && at > 0 && this.now() - at < LOGIN_LOOP_WINDOW_MS;
  }

  private clearSession() {
    this.tokens = null;
    this.deps.store.removeItem(STORAGE_KEYS.devSession);
  }

  private readDevSession(): TokenSet | null {
    const raw = this.deps.store.getItem(STORAGE_KEYS.devSession);
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw) as TokenSet;
      if (typeof saved.accessToken === "string" && saved.expiresAt - this.now() > RENEW_SKEW_MS) return saved;
    } catch {
      // Unreadable: treated as no session.
    }
    this.deps.store.removeItem(STORAGE_KEYS.devSession);
    return null;
  }

  private authorizationServer(config: OidcConfig): Promise<AuthorizationServer> {
    this.server ??= discover(config, this.oidcOptions()).catch((error: unknown) => {
      this.server = null;
      throw error;
    });
    return this.server;
  }

  private oidcOptions(): OidcOptions {
    return { fetch: this.deps.fetch, now: this.now };
  }

  private redirectUri(): string {
    return `${this.deps.origin}${BASE_PATH}${CALLBACK_PATH}`;
  }
}
