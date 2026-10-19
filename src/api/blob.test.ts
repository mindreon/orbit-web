import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./errors";
describe("U13 binary reads", () => {
  it("sends identity and tenant headers and returns bytes without JSON decoding", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([0, 255, 1]), { headers: { "Content-Type": "application/octet-stream" } }));
    const api = createApiClient({ credentials: { token: () => "token", tenant: () => "tenant", unauthorized: vi.fn() }, fetch: fetcher });
    expect([...new Uint8Array(await (await api.getBlob("/file")).arrayBuffer())]).toEqual([0, 255, 1]);
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Orbit-Tenant")).toBe("tenant");
    expect(headers.has("Idempotency-Key")).toBe(false);
  });
  it.each([401, 404, 503])("maps HTTP %i to ApiError, notifying identity only for 401", async (status) => {
    const unauthorized = vi.fn();
    const api = createApiClient({ credentials: { token: () => "token", tenant: () => "tenant", unauthorized }, fetch: async () => new Response('{"error":{"code":"FORBIDDEN","message":"no","retryable":false}}', { status }) });
    await expect(api.getBlob("/file")).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
});
