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
export function RecentSessions({ query = "" }: { query?: string }) {
  const source = useContext(InboxSourceContext); const { currentTenant } = useIdentity();
  const inbox = useQuery({ queryKey: qk.inbox(currentTenant?.id ?? null), enabled: Boolean(source), queryFn: ({ signal }) => source!.listPending(signal), staleTime: 30_000 });
  const sessions = useRecentSessions(); const [page, setPage] = useState(0);
  const all = [...new Map(sessions.data?.pages.flatMap((chunk) => chunk.items).map((item) => [item.id, item])).values()];
  const needle = query.trim().toLowerCase();
  const matched = needle ? all.filter((item) => (item.title || "未命名会话").toLowerCase().includes(needle)) : all;
  const items = matched.slice(page * 12, page * 12 + 12);
  return <section aria-label="最近会话"><p className="px-3 pb-1 text-caption font-medium text-gray-500">最近会话</p>{items.map((item) => <NavLink key={item.id} to={`/sessions/${item.id}`} className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-control px-3 text-body text-gray-800 hover:bg-gray-200", isActive && "bg-sidebar-accent font-medium text-primary-700 hover:bg-sidebar-accent")}><span className="min-w-0 flex-1 truncate">{item.title || "未命名会话"}</span>{sidebarStatus(item, inbox.data ?? []) ? <span title={sidebarStatus(item, inbox.data ?? []) === "waiting" ? "等待你处理" : "运行中"} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sidebarStatus(item, inbox.data ?? []) === "waiting" ? "bg-warning-500" : "bg-primary-500")} /> : null}</NavLink>)}{sessions.isPending ? <div className="mx-3 h-8 rounded-control bg-gray-100" /> : null}{needle && !items.length && !sessions.isPending ? <p className="px-3 py-1 text-caption text-gray-500">没有匹配的会话</p> : null}<div className="mt-2 px-3">{page > 0 ? <button className="mb-2 block text-caption text-muted-foreground" onClick={() => setPage(0)}>返回最近会话</button> : null}<Pager hasNextPage={!needle && (sessions.hasNextPage || matched.length > (page + 1) * 12)} loading={sessions.isFetchingNextPage} onLoadMore={() => { if (matched.length > (page + 1) * 12) setPage((value) => value + 1); else void sessions.fetchNextPage().then(() => setPage((value) => value + 1)); }} /></div></section>;
}
