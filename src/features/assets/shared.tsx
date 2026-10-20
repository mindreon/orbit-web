import type { ReactNode } from "react";
import { describeFailure, isRetryable } from "../../api/errors";
import { Pager } from "../../components/Pager";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
export const itemsOf = <T,>(query: { data?: { pages: { items: T[] }[] } }) => query.data?.pages.flatMap((page) => page.items) ?? [];
export function QueryContent({ query, children, empty }: { query: { isPending: boolean; error: unknown; refetch(): unknown }; children: ReactNode; empty?: string }) {
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.error) return <Alert>{describeFailure("加载失败", query.error)}{isRetryable(query.error) ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert>;
  return children || <p className="py-8 text-center text-body text-muted-foreground">{empty || "还没有内容"}</p>;
}
export function MorePages({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage(): unknown } }) { return <div className="mt-3"><Pager hasNextPage={query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => void query.fetchNextPage()} /></div>; }
