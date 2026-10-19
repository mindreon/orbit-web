import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { Button } from "../../ui/Button";
import { NewSessionDialog } from "./NewSessionDialog";
import { useRecentSessions } from "./api";
export default function SessionsHome() {
  const client = useQueryClient(); const { currentTenant } = useIdentity();
  const [params, setParams] = useSearchParams(); const [open, setOpen] = useState(false);
  const navigate = useNavigate(); const workspace = useWorkspace(); const sessions = useRecentSessions();
  const latest = sessions.data?.pages[0]?.items[0];
  function close() { setOpen(false); const next = new URLSearchParams(params); next.delete("new"); setParams(next, { replace: true }); }
  return <div className="min-h-0 flex-1 overflow-auto bg-muted px-4 pb-6 sm:px-6"><header className="pb-4 pt-6"><h1 className="text-title font-semibold">会话</h1></header><div className="mx-auto max-w-reading space-y-4 py-12 text-center">
    <p className="text-body text-muted-foreground">{!workspace.current ? "还没有可用的工作空间" : latest ? "继续最近的会话，或开始新的对话" : "选择专家或专家团，开始一段对话"}</p>
    {latest ? <Link className="block text-body text-primary-700" to={`/sessions/${latest.id}`}>{latest.title || "未命名会话"}</Link> : null}
    <Button variant="primary" disabled={!workspace.current} onClick={() => setOpen(true)}>新建会话</Button>
  </div>{(open || params.has("new")) && workspace.current ? <NewSessionDialog onClose={close} onCreated={(session) => { void client.invalidateQueries({ queryKey: qk.sessionLists(currentTenant?.id ?? null) }); close(); navigate(`/sessions/${session.id}`); }} /> : null}</div>;
}
