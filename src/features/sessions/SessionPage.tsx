import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError, describeFailure } from "../../api/errors";
import type { Decision, Message, Run, Session, S } from "../../api/types";
import { emptyRunStream, type RunStreamState } from "../../api/timeline";
import { fetchRunHistory } from "../../api/history";
import { reduceRunEvent } from "../../api/timeline";
import { entryKindLabels } from "../../components/kindLabels";
import { StreamStatus } from "../../components/StreamStatus";
import { Markdown } from "../../components/markdown/Markdown";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useMediaQuery } from "../../platform/useMediaQuery";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { DropdownMenu } from "../../ui/DropdownMenu";
import { Input, Select } from "../../ui/fields";
import { Skeleton } from "../../ui/Skeleton";
import { FileArea } from "../files";
import { SessionTeamBoard } from "../teams";
import { activeStatus, allPages } from "./api";
import { Composer, type SendResult } from "./Composer";
import { policyLabels } from "./NewSessionDialog";
import { runStateLabels, Timeline, UserBubble } from "../runs";
import { useSessionStream } from "./useSessionStream";

function RunTurn({ run, state, messages, archived, team }: { run: Run; state?: RunStreamState; messages: readonly Message[]; archived: boolean; team: boolean }) {
  const { currentTenant, principal } = useIdentity(); const tenant = currentTenant?.id ?? null;
  const client = useQueryClient(); const [expanded, setExpanded] = useState<RunStreamState>();
  const [loading, setLoading] = useState(false); const [error, setError] = useState<unknown>();
  const timeline = state ?? expanded;
  const interactions = useQuery({ queryKey: qk.runInteractions(tenant, run.id), enabled: Boolean(timeline?.interactions.size) || run.status === "waiting_input" || run.status === "waiting_approval", queryFn: ({ signal }) => allPages<S["Interaction"]>(`/runs/${run.id}/interactions`, { signal }) });
  const [intent, setIntent] = useState<{ value: string; key: string } | null>(null);
  async function resolve(item: S["Interaction"], decision: Decision) {
    const value = JSON.stringify([item.id, decision]); const key = intent?.value === value ? intent.key : crypto.randomUUID();
    setIntent({ value, key });
    try {
      await api.post(`/interactions/${item.id}/resolve`, decision, { idempotencyKey: key }); setIntent(null);
      await client.invalidateQueries({ queryKey: qk.runInteractions(tenant, run.id) });
      await client.invalidateQueries({ queryKey: qk.inbox(tenant) });
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "INTERACTION_NOT_PENDING") await client.invalidateQueries({ queryKey: qk.runInteractions(tenant, run.id) });
      throw failure;
    }
  }
  const status = run.status;
  const duration = run.started_at && run.ended_at ? `${Math.max(0, Math.round((Date.parse(run.ended_at) - Date.parse(run.started_at)) / 1000))}秒` : null;
  const hasFinal = timeline?.messages.some((message) => message.final);
  return <section data-run-id={run.id} className="min-w-0 space-y-2">
    {team ? <SessionTeamBoard runId={run.id} active={activeStatus(status)} teamSignal={timeline?.teamSignal} /> : null}
    {!timeline ? messages.filter((message) => message.role === "user").map((message) => <UserBubble key={message.id} text={message.text ?? ""} />) : null}
    {timeline ? <Timeline userMessages={messages.filter((message) => message.role === "user")} state={timeline} runStatus={run.status} interactions={interactions.data?.items ?? []} principalId={principal?.id ?? ""} onResolve={resolve} readOnly={archived} /> : <Button variant="ghost" size="sm" disabled={loading} onClick={() => { setLoading(true); void fetchRunHistory(api, run.id).then((history) => setExpanded(history.events.reduce(reduceRunEvent, emptyRunStream)), setError).finally(() => setLoading(false)); }}>展开过程</Button>}
    {!hasFinal ? messages.filter((message) => message.role === "assistant").map((message) => <div key={message.id}><Markdown text={message.text ?? ""} />{message.truncated || message.content_ref ? <p className="text-caption text-muted-foreground">内容过长，已截断显示</p> : null}</div>) : null}
    {error ? <Alert>{describeFailure("读取过程失败", error)}</Alert> : null}
    <div className="flex items-center gap-3 py-2 text-caption text-muted-foreground"><span aria-hidden="true" className="h-px flex-1 bg-border" /><span className="flex flex-wrap items-baseline justify-center gap-x-1.5"><span data-run-status={status}>{runStateLabels[status]}</span>{duration ? <><span aria-hidden="true">·</span><span>{duration}</span></> : null}<span aria-hidden="true">·</span><span>{(timeline?.usage?.cost_millicredits ?? run.used_millicredits) / 1000} 积分</span><span aria-hidden="true">·</span><Link to={`/runs/${run.id}`} className="hover:text-foreground hover:underline">查看运行</Link></span><span aria-hidden="true" className="h-px flex-1 bg-border" /></div>
  </section>;
}
function SessionHeader({ session, stream, reconnect, onFiles }: { session: Session; stream: ReturnType<typeof useSessionStream>["stream"]; reconnect(): void; onFiles(): void }) {
  const { currentTenant } = useIdentity(); const tenant = currentTenant?.id ?? null; const client = useQueryClient();
  const [editing, setEditing] = useState(false); const [title, setTitle] = useState(session.title); const [archive, setArchive] = useState(false);
  const intent = useIdempotencyIntent({ title });
  const mutation = useMutation({ mutationFn: async (body: { title?: string; message_policy?: Session["message_policy"] }) => api.patch<Session>(`/sessions/${session.id}`, body, { idempotencyKey: body.title !== undefined ? intent.key : crypto.randomUUID() }), onSuccess: (value) => { client.setQueryData(qk.session(tenant, session.id), value); void client.invalidateQueries({ queryKey: qk.sessionLists(tenant) }); intent.succeeded(); setEditing(false); } });
  const archiveIntent = useIdempotencyIntent(session.id);
  const archiveMutation = useMutation({ mutationFn: () => api.post(`/sessions/${session.id}/archive`, undefined, { idempotencyKey: archiveIntent.key }), onSuccess: () => { archiveIntent.succeeded(); client.setQueryData<Session>(qk.session(tenant, session.id), (item) => item ? { ...item, status: "archived" } : item); void client.invalidateQueries({ queryKey: qk.sessionLists(tenant) }); setArchive(false); } });
  return <><header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 sm:h-14 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0">
    {editing ? <form className="min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ title }); }}><Input autoFocus aria-label="会话标题" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setTitle(session.title); setEditing(false); } }} onBlur={() => { if (title !== session.title) mutation.mutate({ title }); else setEditing(false); }} /></form> : <h1 className="min-w-0 flex-1 truncate text-title font-semibold"><button className="max-w-full truncate text-left" disabled={session.status === "archived"} onClick={() => setEditing(true)}>{session.title || "未命名会话"}</button></h1>}
    <span className="hidden max-w-48 truncate text-small text-muted-foreground md:block">{entryKindLabels[session.entry_kind]} · {session.entry_ref}</span>
    <div className="flex max-w-full flex-wrap items-center gap-2">{session.status !== "archived" ? stream.status !== "live" ? <StreamStatus {...stream} onReconnect={reconnect} /> : <span role="status" aria-label="实时" className="h-1.5 w-1.5 rounded-full bg-primary-500" /> : null}
      <Select aria-label="消息策略" value={session.message_policy} disabled={session.status === "archived" || mutation.isPending} onChange={(event) => mutation.mutate({ message_policy: event.target.value as Session["message_policy"] })}>{Object.entries(policyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Button size="sm" variant="ghost" onClick={onFiles}>文件</Button><DropdownMenu trigger={<button type="button" aria-label="更多操作" className="flex h-8 w-8 items-center justify-center rounded-control hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>} items={[{ label: "归档", disabled: session.status === "archived", onSelect: () => setArchive(true) }]} />
    </div>
  </header>{mutation.error ? <Alert>{describeFailure("保存失败", mutation.error)}</Alert> : null}{archive ? <Dialog title="归档会话" onClose={() => setArchive(false)}><p className="mb-4 text-body">归档后会话将变为只读，不能继续发送消息。</p>{archiveMutation.error ? <Alert>{describeFailure("归档失败", archiveMutation.error)}</Alert> : null}<div className="flex justify-end gap-2"><Button onClick={() => setArchive(false)}>取消</Button><Button variant="primary" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate()}>确认归档</Button></div></Dialog> : null}</>;
}
export default function SessionPage() {
  const { sessionId = "" } = useParams(); const { currentTenant } = useIdentity(); const tenant = currentTenant?.id ?? null; const client = useQueryClient();
  const { hash } = useLocation(); const timelineRoot = useRef<HTMLDivElement>(null); const scrolledHash = useRef("");
  useEffect(() => {
    const key = `${sessionId}${hash}`;
    if (!hash.startsWith("#interaction-") || scrolledHash.current === key) return;
    const root = timelineRoot.current;
    if (!root) return;
    function scroll() {
      const element = document.getElementById(hash.slice(1));
      if (!element || !root?.contains(element)) return false;
      element.scrollIntoView({ block: "center" }); scrolledHash.current = key;
      return true;
    }
    if (scroll()) return;
    const observer = new MutationObserver(() => { if (scroll()) observer.disconnect(); });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
  const wide = useMediaQuery("(min-width: 1280px)"); const [files, setFiles] = useState(false);
  const [older, setOlder] = useState<Run[]>([]); const [olderCursor, setOlderCursor] = useState<string | null>(null); const [loadingOlder, setLoadingOlder] = useState(false);
  const session = useQuery({ queryKey: qk.session(tenant, sessionId), queryFn: ({ signal }) => api.get<Session>(`/sessions/${sessionId}`, { signal }) });
  const messages = useQuery({ queryKey: qk.messages(tenant, sessionId), queryFn: ({ signal }) => allPages<Message>(`/sessions/${sessionId}/messages`, { signal }, 20) });
  const runs = useQuery({ queryKey: qk.runs(tenant, sessionId), queryFn: ({ signal }) => api.get<{ items: Run[]; next_cursor?: string }>(`/sessions/${sessionId}/runs`, { signal, query: { order: "desc", limit: 100 } }) });
  useQuery({ queryKey: qk.artifacts(tenant, sessionId), queryFn: async ({ signal }) => (await allPages<S["Artifact"]>(`/sessions/${sessionId}/artifacts`, { signal })).items });
  const live = useSessionStream(sessionId, tenant, runs.data?.items, session.data?.status);
  const known = new Map([...older, ...(runs.data?.items ?? [])].map((run) => [run.id, run]));
  for (const [id, state] of live.states) if (!known.has(id)) known.set(id, { id, session_id: sessionId, created_at: new Date().toISOString(), status: state.status ?? "running", used_millicredits: 0 } as Run);
  const orderedRuns = [...known.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const active = [...orderedRuns].reverse().find((run) => activeStatus(run.status));
  const activeState = active ? live.states.get(active.id) : undefined; const activeRunStatus = active?.status;
  const waiting = activeRunStatus === "waiting_input" || activeRunStatus === "waiting_approval";
  const pending = activeState ? [...activeState.interactions].find(([, item]) => !item.resolution) : undefined;
  const action = useMutation({ mutationFn: (kind: "cancel" | "pause" | "resume") => api.post(`/runs/${active?.id}/${kind}`), onSuccess: () => client.invalidateQueries({ queryKey: qk.runs(tenant, sessionId) }) });
  const cursor = olderCursor === null ? runs.data?.next_cursor : olderCursor;
  if (session.error instanceof ApiError && session.error.status === 404) return <div className="p-6 text-body">找不到此会话</div>;
  const failure = session.error ?? messages.error ?? runs.error;
  if (failure) return <div className="p-6"><Alert>{describeFailure("读取会话失败", failure)}<Button onClick={() => { void session.refetch(); void messages.refetch(); void runs.refetch(); }}>重试</Button></Alert></div>;
  if (!session.data || messages.isPending || runs.isPending) return <div className="space-y-6 p-6"><Skeleton className="h-12" /><Skeleton className="mx-auto h-48 max-w-reading" /><Skeleton className="mx-auto h-24 max-w-reading" /></div>;
  const archived = session.data.status === "archived";
  return <><SessionHeader session={session.data} stream={live.stream} reconnect={live.reconnect} onFiles={() => setFiles((value) => !value)} /><div className="flex min-h-0 flex-1 bg-card"><div className="flex min-w-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6"><div ref={timelineRoot} className="mx-auto max-w-reading space-y-6">
      {messages.data?.capped ? <p className="text-caption text-muted-foreground">更早的消息未加载</p> : null}
      {cursor ? <Button size="sm" disabled={loadingOlder} onClick={() => { setLoadingOlder(true); void api.get<{ items: Run[]; next_cursor?: string }>(`/sessions/${sessionId}/runs`, { query: { order: "desc", limit: 100, cursor } }).then((page) => { setOlder((items) => [...items, ...page.items]); setOlderCursor(page.next_cursor || ""); }).finally(() => setLoadingOlder(false)); }}>加载更多</Button> : null}
      {[
        ...orderedRuns.map((run) => ({ kind: "run" as const, value: run })),
        ...(messages.data?.items ?? []).filter((message) => message.role === "user" && !message.run_id).map((message) => ({ kind: "message" as const, value: message })),
      ].sort((a, b) => a.value.created_at.localeCompare(b.value.created_at) || a.value.id.localeCompare(b.value.id)).map((item) => item.kind === "message" ? <UserBubble key={`message:${item.value.id}`} text={item.value.text ?? ""} /> : <RunTurn key={item.value.id} run={item.value} state={live.states.get(item.value.id)} archived={archived} team={session.data.entry_kind === "team"} messages={messages.data?.items.filter((message) => message.run_id === item.value.id) ?? []} />)}
      {!orderedRuns.length ? <p className="py-12 text-center text-body text-muted-foreground">正在与{entryKindLabels[session.data.entry_kind]} {session.data.entry_ref} 对话</p> : null}
    </div></div>
    <div className="shrink-0 px-4 pb-4 sm:px-6"><div className="mx-auto max-w-reading">{waiting ? <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-warning-50 px-3 py-2 text-small text-warning-700"><span>{activeRunStatus === "waiting_approval" ? "有工具调用等待你审批" : "有问题等待你回答"}</span><button onClick={() => { if (pending) document.getElementById(`interaction-${pending[0]}`)?.scrollIntoView({ block: "center" }); }}>跳到卡片</button></div> : null}
      <Composer actionPending={action.isPending} archived={archived} active={Boolean(active) && !archived} status={activeRunStatus} onStop={() => action.mutate("cancel")} onPause={() => action.mutate(activeRunStatus === "paused" ? "resume" : "pause")} onSend={async (text, key) => { const result = await api.post<SendResult>(`/sessions/${sessionId}/messages`, { text }, { idempotencyKey: key }); await Promise.all([client.invalidateQueries({ queryKey: qk.messages(tenant, sessionId) }), client.invalidateQueries({ queryKey: qk.runs(tenant, sessionId) })]); return result; }} />
    </div></div>
  </div>{files && wide ? <aside aria-label="文件区" className="flex w-80 shrink-0 flex-col bg-muted"><h2 className="flex h-10 shrink-0 items-center px-4 text-small font-medium text-muted-foreground">文件</h2><div className="min-h-0 flex-1 overflow-auto px-4 pb-4"><FileArea sessionId={sessionId} /></div></aside> : null}</div>{files && !wide ? <Dialog wide title="文件" onClose={() => setFiles(false)}><div className="flex h-96 flex-col"><FileArea sessionId={sessionId} /></div></Dialog> : null}</>;
}
