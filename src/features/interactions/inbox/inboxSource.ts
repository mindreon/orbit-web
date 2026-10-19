import type { ApiClient } from "../../../api/client";
import { ApiError } from "../../../api/errors";
import type { Decision, InteractionRequest, S } from "../../../api/types";
import { api } from "../../../platform/client";
export interface InboxItem {
  id: string; kind: string; member: string; sessionId: string; runId: string;
  request: InteractionRequest; expiresAt: string; approvers: string[];
}
export interface InboxSource {
  listPending(signal?: AbortSignal): Promise<InboxItem[]>;
  resolve(item: InboxItem, decision: Decision): Promise<void>;
}
export class AlreadyHandled extends Error { readonly alreadyHandled = true; }
export function createControlInboxSource(client: ApiClient): InboxSource {
  const intents = new Map<string, { fingerprint: string; key: string }>();
  return {
    async listPending(signal) {
      const items: InboxItem[] = [];
      let cursor: string | undefined;
      do {
        const page: { items: S["Interaction"][]; next_cursor?: string } = await client.get("/interactions", { query: { cursor, limit: 100 }, signal });
        items.push(...page.items.map((item) => ({ id: item.id, kind: item.kind, member: item.member, sessionId: item.session_id, runId: item.run_id, request: item.request, expiresAt: item.expires_at, approvers: item.approvers })));
        if (page.next_cursor && page.next_cursor === cursor) throw new Error("收件箱游标未前进");
        cursor = page.next_cursor || undefined;
      } while (cursor);
      return items;
    },
    async resolve(item, decision) {
      const fingerprint = JSON.stringify(decision);
      let intent = intents.get(item.id);
      if (!intent || intent.fingerprint !== fingerprint) { intent = { fingerprint, key: crypto.randomUUID() }; intents.set(item.id, intent); }
      try { await client.post(`/interactions/${item.id}/resolve`, decision, { idempotencyKey: intent.key }); intents.delete(item.id); }
      catch (error) { if (error instanceof ApiError && error.status === 409 && error.code === "INTERACTION_NOT_PENDING") { intents.delete(item.id); throw new AlreadyHandled("已被其他审批人处理"); } throw error; }
    },
  };
}
export const controlInboxSource = createControlInboxSource(api);
