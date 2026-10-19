import { useContext, useState } from "react";
import { NavLink } from "react-router";
import { cn } from "../../lib/cn";
import { Pager } from "../../components/Pager";
import { useRecentSessions } from "./api";
import { useQuery } from "@tanstack/react-query";
import { InboxSourceContext } from "../interactions";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { sidebarStatus } from "./sidebarStatus";
export function RecentSessions() {
  const source = useContext(InboxSourceContext); const { currentTenant } = useIdentity();
  const inbox = useQuery({ queryKey: qk.inbox(currentTenant?.id ?? null), enabled: Boolean(source), queryFn: ({ signal }) => source!.listPending(signal), staleTime: 30_000 });
  const query = useRecentSessions(); const [page, setPage] = useState(0);
  const all = [...new Map(query.data?.pages.flatMap((chunk) => chunk.items).map((item) => [item.id, item])).values()];
  const items = all.slice(page * 12, page * 12 + 12);
  return <section aria-label="最近会话" className="px-2 pb-4"><p className="px-3 pb-2 text-small font-medium text-muted-foreground">最近会话</p>{items.map((item) => <NavLink key={item.id} to={`/sessions/${item.id}`} className={({ isActive }) => cn("flex h-8 items-center gap-2 rounded-control px-3 text-body hover:bg-gray-100", isActive && "bg-gray-200 font-medium")}><span className="min-w-0 flex-1 truncate">{item.title || "未命名会话"}</span>{sidebarStatus(item, inbox.data ?? []) ? <span title={sidebarStatus(item, inbox.data ?? []) === "waiting" ? "等待你处理" : "运行中"} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sidebarStatus(item, inbox.data ?? []) === "waiting" ? "bg-warning-500" : "bg-primary-500")} /> : null}</NavLink>)}{query.isPending ? <div className="mx-3 h-8 rounded-control bg-gray-100" /> : null}<div className="mt-2 px-3">{page > 0 ? <button className="mb-2 block text-caption text-muted-foreground" onClick={() => setPage(0)}>返回最近会话</button> : null}<Pager hasNextPage={query.hasNextPage || all.length > (page + 1) * 12} loading={query.isFetchingNextPage} onLoadMore={() => { if (all.length > (page + 1) * 12) setPage((value) => value + 1); else void query.fetchNextPage().then(() => setPage((value) => value + 1)); }} /></div></section>;
}
