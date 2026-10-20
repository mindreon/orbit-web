import { expect, it, vi } from "vitest";
import { createApiClient } from "./client";
it("revokes an asset grant using a JSON DELETE body and the intent key", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  const api = createApiClient({ fetch: fetcher, credentials: { token: () => "test", tenant: () => "scope", unauthorized() {} } });
  const grant = { grantee_type: "user", grantee_id: "user", permission: "use" };
  await api.delete("/assets/a/grants", { body: grant, idempotencyKey: "intent" });
  expect(fetcher).toHaveBeenCalledWith("/v1/assets/a/grants", expect.objectContaining({ method: "DELETE", body: JSON.stringify(grant) }));
  const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
  expect(headers.get("Content-Type")).toBe("application/json"); expect(headers.get("Idempotency-Key")).toBe("intent");
});
