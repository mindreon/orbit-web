import * as oauth from "oauth4webapi";
import type { AuthConfig } from "../../api/auth";
import { STORAGE_KEYS, type KeyValueStore, type TokenSet } from "./storage";

export type OidcConfig = Extract<AuthConfig, { mode: "oidc" }>;

const DEFAULT_SCOPES = ["openid", "profile", "email"];
/** The IdP omitted `expires_in`: assume the shortest sensible lifetime and renew early rather than late. */
const FALLBACK_LIFETIME_S = 300;

interface PendingAuthorization {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

export interface OidcOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

const fetchOptions = (options: OidcOptions) => (options.fetch ? { [oauth.customFetch]: options.fetch } : {});
const client = (config: OidcConfig): oauth.Client => ({ client_id: config.client_id });

export async function discover(config: OidcConfig, options: OidcOptions = {}): Promise<oauth.AuthorizationServer> {
  const issuer = new URL(config.issuer);
  const response = await oauth.discoveryRequest(issuer, { algorithm: "oidc", ...fetchOptions(options) });
  return oauth.processDiscoveryResponse(issuer, response);
}

/**
 * Starts an authorization code flow with PKCE (S256), a random `state` and `nonce`. The secrets of the request stay in
 * sessionStorage, which belongs to this tab alone, until the IdP sends the browser back. Returns the IdP URL to go to.
 */
export async function beginAuthorization(as: oauth.AuthorizationServer, config: OidcConfig, redirectUri: string, returnTo: string, store: KeyValueStore): Promise<URL> {
  if (!as.authorization_endpoint) throw new Error("身份服务没有提供授权地址（authorization_endpoint）");
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const pending: PendingAuthorization = { state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce(), codeVerifier, returnTo };
  store.setItem(STORAGE_KEYS.oidcPending, JSON.stringify(pending));

  const url = new URL(as.authorization_endpoint);
  const scopes = config.scopes?.length ? config.scopes : DEFAULT_SCOPES;
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.includes("openid") ? scopes.join(" ") : ["openid", ...scopes].join(" "));
  url.searchParams.set("state", pending.state);
  url.searchParams.set("nonce", pending.nonce);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (config.audience) url.searchParams.set("audience", config.audience);
  return url;
}

/**
 * Finishes the flow on the callback URL: checks `state` against the stored request (and that an error response is not hiding
 * behind it), exchanges the code with the stored verifier, and checks the ID token's issuer, audience, expiry and `nonce`.
 * The stored request is single-use: it is removed before the exchange, so a replayed callback fails.
 */
export async function completeAuthorization(
  as: oauth.AuthorizationServer,
  config: OidcConfig,
  redirectUri: string,
  callbackUrl: URL,
  store: KeyValueStore,
  options: OidcOptions = {},
): Promise<{ tokens: TokenSet; returnTo: string }> {
  const raw = store.getItem(STORAGE_KEYS.oidcPending);
  store.removeItem(STORAGE_KEYS.oidcPending);
  if (!raw) throw new Error("没有进行中的登录请求，请重新登录");
  const pending = JSON.parse(raw) as PendingAuthorization;

  const parameters = validateCallback(as, config, callbackUrl, pending.state);
  const response = await oauth.authorizationCodeGrantRequest(as, client(config), oauth.None(), parameters, redirectUri, pending.codeVerifier, fetchOptions(options));
  const result = await oauth.processAuthorizationCodeResponse(as, client(config), response, { expectedNonce: pending.nonce, requireIdToken: true });
  return { tokens: toTokenSet(result, undefined, options.now ?? Date.now), returnTo: pending.returnTo };
}

function validateCallback(as: oauth.AuthorizationServer, config: OidcConfig, callbackUrl: URL, state: string): URLSearchParams {
  try {
    return oauth.validateAuthResponse(as, client(config), callbackUrl, state);
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError) throw new Error(`身份服务拒绝了登录：${error.error_description || error.error}`, { cause: error });
    throw error;
  }
}

/** Trades the refresh token for a new access token. IdPs that rotate refresh tokens send a new one; otherwise the old one stays. */
export async function refreshTokens(as: oauth.AuthorizationServer, config: OidcConfig, current: TokenSet, options: OidcOptions = {}): Promise<TokenSet> {
  if (!current.refreshToken) throw new Error("没有可用的刷新令牌");
  const response = await oauth.refreshTokenGrantRequest(as, client(config), oauth.None(), current.refreshToken, fetchOptions(options));
  const result = await oauth.processRefreshTokenResponse(as, client(config), response);
  return toTokenSet(result, current, options.now ?? Date.now);
}

/** Where to end the IdP's own session, or null when the IdP has no end-session endpoint. `postLogoutRedirect` must be registered at the IdP. */
export function endSessionUrl(as: oauth.AuthorizationServer, config: OidcConfig, tokens: TokenSet | null, postLogoutRedirect: string): URL | null {
  if (!as.end_session_endpoint) return null;
  const url = new URL(as.end_session_endpoint);
  url.searchParams.set("client_id", config.client_id);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirect);
  if (tokens?.idToken) url.searchParams.set("id_token_hint", tokens.idToken);
  return url;
}

function toTokenSet(result: oauth.TokenEndpointResponse, previous: TokenSet | undefined, now: () => number): TokenSet {
  return {
    accessToken: result.access_token,
    expiresAt: now() + (result.expires_in ?? FALLBACK_LIFETIME_S) * 1000,
    refreshToken: result.refresh_token ?? previous?.refreshToken,
    idToken: result.id_token ?? previous?.idToken,
  };
}
