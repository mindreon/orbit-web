import { expect, it, vi } from "vitest";
import { ApiError } from "../../../api/errors";
vi.mock("../../../platform/client", () => ({ api: {} }));
import type { ApiClient } from "../../../api/client";
import { createControlInboxSource } from "./inboxSource";
it("U15 reads every page, maps IDs, sends Decision unchanged, and marks a handled conflict", async () => {
  const interaction = { id: "uuid", kind: "ask_user", member: "main", session_id: "s", run_id: "r", request: { kind: "ask_user", interaction_id: "local" }, expires_at: "later", approvers: ["me"] };
  const get = vi.fn().mockResolvedValueOnce({ items: [interaction], next_cursor: "next" }).mockResolvedValueOnce({ items: [], next_cursor: "" });
  const post = vi.fn().mockResolvedValue(undefined);
  const source = createControlInboxSource({ get, post } as unknown as ApiClient);
  const [item] = await source.listPending();
  expect(item).toMatchObject({ id: "uuid", sessionId: "s", runId: "r", expiresAt: "later", request: interaction.request });
  expect(get.mock.calls[1][1].query.cursor).toBe("next");
  const decision = { kind: "ask_user" as const, answer: "hello" };
  await source.resolve(item, decision);
  expect(post.mock.calls[0].slice(0, 2)).toEqual(["/interactions/uuid/resolve", decision]);
  post.mockRejectedValueOnce(new ApiError(409, { code: "INTERACTION_NOT_PENDING", message: "handled", retryable: false }));
  await expect(source.resolve(item, decision)).rejects.toMatchObject({ alreadyHandled: true });
});
