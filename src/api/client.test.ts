import { describe, expect, it, vi } from "vitest";
import { apiError, json } from "../test/helpers";
import { createApiClient, type Credentials } from "./client";
import { ApiError, NetworkError } from "./errors";

/**
 * Ways the API client can fail, each asserted below:
 *   A1 a request goes out without the bearer token or the tenant header (or sends them to the login endpoints that must not carry them)
 *   A2 a write has no Idempotency-Key, two writes share a generated one, or a caller's key is replaced
 *   A3 the `{"error": {...}}` body is lost: the code, message, retryable flag or details do not reach the caller
 *   A4 a non-JSON failure (a proxy's 502 page) crashes the parser instead of becoming a retryable ApiError
 *   A5 a 401 does not tell the auth module, or tells it for a login attempt
 *   A6 a dropped connection looks like an API error, or a caller's abort looks like a network failure
 */

function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>, credentials: Partial<Credentials> = {}) {
  const calls: { url: string; init: RequestInit; headers: Headers }[] = [];
  const unauthorized = vi.fn();
  let keys = 0;
  const api = createApiClient({
    credentials: { token: () => "tok-1", tenant: () => "t-1", unauthorized, ...credentials },
    fetch: async (input, init = {}) => {
      const call = { url: String(input), init, headers: new Headers(init.headers) };
      calls.push(call);
      return responder(call.url, init);
    },
    newIdempotencyKey: () => `key-${++keys}`,
  });
  return { api, calls, unauthorized };
}

describe("request headers (A1)", () => {
  it("sends the bearer token and the tenant to the same-origin /v1", async () => {
    const { api, calls } = setup(() => json({ ok: true }));
    await expect(api.get("/me")).resolves.toEqual({ ok: true });
    expect(calls[0].url).toBe("/v1/me");
    expect(calls[0].headers.get("Authorization")).toBe("Bearer tok-1");
    expect(calls[0].headers.get("X-Orbit-Tenant")).toBe("t-1");
  });

  it("waits for a token that has to be renewed first", async () => {
    const { api, calls } = setup(() => json({}), { token: async () => "renewed" });
    await api.get("/me");
    expect(calls[0].headers.get("Authorization")).toBe("Bearer renewed");
  });

  it("omits the headers it has no value for", async () => {
    const { api, calls } = setup(() => json({}), { token: () => null, tenant: () => null });
    await api.get("/me");
    expect(calls[0].headers.has("Authorization")).toBe(false);
    expect(calls[0].headers.has("X-Orbit-Tenant")).toBe(false);
  });

  it("does not send credentials to the login endpoints", async () => {
    const { api, calls } = setup(() => json({}));
    await api.get("/auth/config", { authenticated: false });
    expect(calls[0].headers.has("Authorization")).toBe(false);
    expect(calls[0].headers.has("X-Orbit-Tenant")).toBe(false);
  });

  it("builds the query string and skips undefined values", async () => {
    const { api, calls } = setup(() => json({}));
    await api.get("/sessions", { query: { workspace: "w 1", limit: 20, archived: false, cursor: undefined } });
    expect(calls[0].url).toBe("/v1/sessions?workspace=w+1&limit=20&archived=false");
  });
});

describe("idempotency (A2)", () => {
  it("gives every write its own key, and no read one", async () => {
    const { api, calls } = setup(() => json({}));
    await api.post("/sessions", { name: "a" });
    await api.post("/sessions", { name: "a" });
    await api.patch("/sessions/s1", {});
    await api.put("/sessions/s1", {});
    await api.delete("/sessions/s1");
    await api.get("/sessions");
    expect(calls.map((call) => call.headers.get("Idempotency-Key"))).toEqual(["key-1", "key-2", "key-3", "key-4", "key-5", null]);
  });

  it("uses the key the caller passes, so a retry of the same intent is deduplicated", async () => {
    const { api, calls } = setup(() => json({}));
    await api.post("/sessions/s1/messages", { text: "hi" }, { idempotencyKey: "my-key" });
    expect(calls[0].headers.get("Idempotency-Key")).toBe("my-key");
  });

  it("sends a JSON body with its content type", async () => {
    const { api, calls } = setup(() => json({}));
    await api.post("/sessions", { name: "a" });
    expect(calls[0].init.body).toBe('{"name":"a"}');
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
  });

  it("generates UUIDs by default", async () => {
    const calls: Headers[] = [];
    const api = createApiClient({
      credentials: { token: () => null, tenant: () => null, unauthorized: vi.fn() },
      fetch: async (_input, init) => {
        calls.push(new Headers(init?.headers));
        return json({});
      },
    });
    await api.post("/sessions");
    expect(calls[0].get("Idempotency-Key")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("errors (A3, A4)", () => {
  it("turns the error body into a typed ApiError", async () => {
    const { api } = setup(() => json({ error: { code: "QUOTA_EXCEEDED", message: "配额已用完", retryable: false, details: { limit: 5 } } }, 429));
    const error = await api.post("/sessions").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "QUOTA_EXCEEDED", message: "配额已用完", retryable: false, details: { limit: 5 } });
  });

  it("trusts the server's retryable flag over the status", async () => {
    const { api } = setup(() => apiError(409, "BUSY", "忙", true));
    await expect(api.get("/x")).rejects.toMatchObject({ code: "BUSY", retryable: true });
  });

  it("makes an ApiError out of a body that is not the error shape", async () => {
    const { api } = setup(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await api.get("/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: "HTTP_502", retryable: true });
    expect((error as ApiError).message).toContain("502");
  });

  it("does not call a plain 400 retryable", async () => {
    const { api } = setup(() => new Response("", { status: 400 }));
    await expect(api.get("/x")).rejects.toMatchObject({ code: "HTTP_400", retryable: false });
  });

  it("returns undefined for 204", async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.delete("/installs/1")).resolves.toBeUndefined();
  });
});

describe("401 (A5)", () => {
  it("tells the auth module once and still throws", async () => {
    const { api, unauthorized } = setup(() => apiError(401, "UNAUTHENTICATED", "请登录"));
    await expect(api.get("/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("treats a 401 from a login endpoint as an answer", async () => {
    const { api, unauthorized } = setup(() => apiError(401, "UNAUTHENTICATED"));
    await expect(api.post("/auth/dev/token", {}, { authenticated: false })).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("does not call a 403 an expired session", async () => {
    const { api, unauthorized } = setup(() => apiError(403, "FORBIDDEN"));
    await expect(api.get("/admin/models")).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).not.toHaveBeenCalled();
  });
});

describe("transport failures (A6)", () => {
  it("wraps a failed fetch in a retryable NetworkError", async () => {
    const { api } = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await api.get("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ retryable: true });
  });

  it("lets the caller's abort through unchanged", async () => {
    const controller = new AbortController();
    const { api } = setup(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(api.get("/x", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
