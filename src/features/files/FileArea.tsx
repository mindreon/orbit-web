import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { S } from "../../api/types";
import { describeFailure } from "../../api/errors";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { FileTree } from "../../components/files/FileTree";
import { FilePreview } from "../../components/files/preview/FilePreview";
import { Alert } from "../../ui/Alert";
import { Skeleton } from "../../ui/Skeleton";
import { apiSource } from "./apiSource";
export function FileArea({ sessionId }: { sessionId: string }) {
  const { currentTenant } = useIdentity(); const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({ queryKey: qk.artifacts(currentTenant?.id ?? null, sessionId), queryFn: async ({ signal }) => {
    const items: S["Artifact"][] = []; let cursor: string | undefined;
    do { const page: { items: S["Artifact"][]; next_cursor?: string } = await api.get(`/sessions/${sessionId}/artifacts`, { signal, query: { limit: 100, cursor } }); items.push(...page.items); if (page.next_cursor && page.next_cursor === cursor) throw new Error("文件游标未前进"); cursor = page.next_cursor || undefined; } while (cursor);
    return items;
  } });
  const artifact = query.data?.find((item) => item.id === selected);
  const source = useMemo(() => artifact ? apiSource(artifact) : null, [artifact]);
  return <div className="flex min-h-0 flex-1 flex-col gap-3">{query.isPending ? <Skeleton className="h-32" /> : query.error ? <Alert>{describeFailure("读取文件失败", query.error)}</Alert> : !query.data?.length ? <p className="py-8 text-center text-body text-muted-foreground">还没有文件</p> : source ? <FilePreview source={source} onBack={() => setSelected(null)} /> : <FileTree entries={query.data.map((item) => ({ ...item, size: item.size_bytes }))} onOpen={(item) => setSelected(item.id)} />}</div>;
}
