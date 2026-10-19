/** Shared by the unit tests: small stand-ins for the browser and the identity provider. Not imported by the app. */
interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const apiError = (status: number, code: string, message = code, retryable = false): Response => json({ error: { code, message, retryable } }, status);

const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** An ID token as an IdP's token endpoint returns it. The browser does not verify its signature (the TLS channel to the token endpoint vouches for it), so the signature is a placeholder. */
export function idToken(claims: { iss: string; aud: string; nonce: string; sub?: string; now: number }): string {
  const iat = Math.floor(claims.now / 1000);
  const payload = { iss: claims.iss, aud: claims.aud, sub: claims.sub ?? "user-1", nonce: claims.nonce, iat, exp: iat + 3600 };
  return `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url(payload)}.c2lnbmF0dXJl`;
}

export const ISSUER = "https://idp.example";
export const CLIENT_ID = "orbit-web";

export const discoveryDocument = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  end_session_endpoint: `${ISSUER}/logout`,
};

export interface TokenRequest {
  readonly params: URLSearchParams;
}

/**
 * A fake IdP behind `fetch`: serves discovery and a token endpoint. `respond` builds the token response for a request (it is told
 * the nonce the client sent, which the test reads from the authorization URL).
 */
export function mockIdp(respond: (request: TokenRequest) => Response | Promise<Response>) {
  const tokenRequests: TokenRequest[] = [];
  let discoveries = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/.well-known/openid-configuration") {
      discoveries += 1;
      return json(discoveryDocument);
    }
    if (url.toString() === discoveryDocument.token_endpoint) {
      const request: TokenRequest = { params: new URLSearchParams(String(init?.body)) };
      tokenRequests.push(request);
      return respond(request);
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch: fetchImpl, tokenRequests, discoveries: () => discoveries };
}
