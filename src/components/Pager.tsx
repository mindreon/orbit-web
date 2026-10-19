import { Button } from "../ui/Button";
export function Pager({ hasNextPage, loading, onLoadMore }: { hasNextPage: boolean; loading: boolean; onLoadMore(): void }) {
  return hasNextPage ? <Button disabled={loading} onClick={onLoadMore}>{loading ? "正在加载…" : "加载更多"}</Button> : null;
}
