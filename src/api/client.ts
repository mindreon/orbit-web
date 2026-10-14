import { ApiError, NetworkError } from "./errors";

/**
 * What the client needs from the sign-in. It is a seam rather than an import of the auth module: this file stays free of React
 * and of any storage, and the tests can stand in for the session.
 */
export interface Credentials {
  /** The bearer token, or null when nobody is signed in. May refresh the token first. */
  token(): Promise<string | null> | string | null;
  /** The tenant the request is for (`X-Orbit-Tenant`). */
  tenant(): string | null;
  /** The server said 401: the session is gone. The auth module signs in again. */
  unauthorized(): void;
}

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly signal?: AbortSignal;
  /** Overrides the generated `Idempotency-Key` of a write. Reuse one key when the caller retries the same intent. */
  readonly idempotencyKey?: string;
  /** False for the endpoints that sign in (`/auth/*`): no bearer, and a 401 there is an answer, not an expired session. */
  readonly authenticated?: boolean;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientConfig {
  /** Same-origin by default: the dev server and Caddy both forward `/v1` to control. */
  readonly baseUrl?: string;
  readonly credentials: Credentials;
  readonly fetch?: typeof fetch;
  readonly newIdempotencyKey?: () => string;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function createApiClient(config: ApiClientConfig): ApiClient {
  const baseUrl = (config.baseUrl ?? "/v1").replace(/\/+$/, "");
  const doFetch = config.fetch ?? ((input, init) => fetch(input, init));
  const newKey = config.newIdempotencyKey ?? (() => crypto.randomUUID());

  async function request<T>(method: Method, path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (method !== "GET") headers.set("Idempotency-Key", options.idempotencyKey ?? newKey());
    if (authenticated) {
      const token = await config.credentials.token();
      if (!token) throw new ApiError(401, { code: "UNAUTHENTICATED", message: "请先登录", retryable: false });
      headers.set("Authorization", `Bearer ${token}`);
      const tenant = config.credentials.tenant();
      if (tenant) headers.set("X-Orbit-Tenant", tenant);
    }

    let response: Response;
    try {
      response = await doFetch(url(baseUrl, path, options.query), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new NetworkError(error);
    }

    if (!response.ok) {
      const error = await ApiError.fromResponse(response);
      if (response.status === 401 && authenticated) config.credentials.unauthorized();
      throw error;
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text === "" ? undefined : JSON.parse(text)) as T;
  }

  return {
    get: (path, options) => request("GET", path, undefined, options),
    post: (path, body, options) => request("POST", path, body, options),
    put: (path, body, options) => request("PUT", path, body, options),
    patch: (path, body, options) => request("PATCH", path, body, options),
    delete: (path, options) => request("DELETE", path, undefined, options),
  };
}

function url(baseUrl: string, path: string, query: RequestOptions["query"]): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) search.set(key, String(value));
  const suffix = search.size > 0 ? `?${search}` : "";
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}${suffix}`;
}
