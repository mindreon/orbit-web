import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { Link } from "react-router";
import { describeFailure } from "../../../api/errors";
import { useIdentity } from "../../../platform/identity";
import { qk } from "../../../platform/queryKeys";
import { toast } from "../../../platform/toast/store";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Skeleton } from "../../../ui/Skeleton";
import { InteractionCard } from "../Cards";
import { InboxSourceContext } from "./context";
import type { InboxItem } from "./inboxSource";
export default function InboxPage() {
  const source = useContext(InboxSourceContext);
  if (!source) throw new Error("InboxSource is required");
  const { currentTenant, principal } = useIdentity();
  const client = useQueryClient();
  const key = qk.inbox(currentTenant?.id ?? null);
  const [notice, setNotice] = useState("");
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => source.listPending(signal), refetchInterval: 30_000, refetchIntervalInBackground: false });
  return <div className="flex min-h-0 flex-1 flex-col bg-muted"><header className="flex h-14 shrink-0 items-center bg-card px-4 sm:px-6"><h1 className="text-title font-semibold text-foreground">收件箱</h1></header><div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6"><div className="mx-auto max-w-reading space-y-3">
    {notice ? <p role="status" className="text-small text-muted-foreground">{notice}</p> : null}
    {query.isPending ? <><Skeleton className="h-48 rounded-card" /><Skeleton className="h-48 rounded-card" /></> : query.error ? <Alert>{describeFailure("操作失败", query.error)}<Button size="sm" onClick={() => void query.refetch()}>重试</Button></Alert> : !query.data?.length ? <p className="py-12 text-center text-body text-muted-foreground">没有待你处理的事项</p> : query.data.map((item) => <section key={item.id} data-run-id={item.runId} className="min-w-0 space-y-2">
      <Link to={`/sessions/${item.sessionId}#interaction-${item.request.interaction_id}`} className="text-small text-muted-foreground hover:text-foreground">会话 · {item.member}<span className="sr-only"> 在会话中查看</span></Link>
      <InteractionCard request={item.request} principalId={principal?.id ?? ""} approvers={item.approvers} expiresAt={item.expiresAt} onResolve={async (decision) => {
        try { await source.resolve(item, decision); }
        catch (error) { if (error && typeof error === "object" && "alreadyHandled" in error) { setNotice("已被其他审批人处理"); toast.info("已被其他审批人处理"); } else throw error; }
        client.setQueryData<InboxItem[]>(key, (items) => items?.filter((entry) => entry.id !== item.id));
      }} />
    </section>)}
  </div></div></div>;
}
