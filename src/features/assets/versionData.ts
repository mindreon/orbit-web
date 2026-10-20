import { api } from "../../platform/client";
/** File sets and channel pointers must be complete before editing/comparing. */
export async function allAssetPages<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = []; let cursor: string | undefined;
  do {
    const page = await api.get<{ items: T[]; next_cursor?: string }>(path, { signal, query: { limit: 100, cursor } });
    result.push(...page.items); cursor = page.next_cursor || undefined;
  } while (cursor);
  return result;
}
