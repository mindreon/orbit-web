import { useState } from "react";
import { useSearchParams } from "react-router";
import { Bot, Users } from "lucide-react";
import { ApiError, describeFailure } from "../../api/errors";
import type { Asset, EntryKind, Session } from "../../api/types";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { cn } from "../../lib/cn";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field, Input, Select } from "../../ui/fields";
import { EntryPicker } from "../../components/EntryPicker";
import { createSession, useEntries } from "./api";
export const policyLabels = { queue: "排队", steer: "插话", interrupt: "打断" };
export function NewSessionDialog({ onClose, onCreated }: { onClose(): void; onCreated(session: Session): void }) {
  const [params] = useSearchParams(); const preselected = params.get("new") ?? "";
  const workspace = useWorkspace(); const entries = useEntries();
  const [entry, setEntry] = useState(preselected.includes(":") ? preselected : "");
  const [kind, setKind] = useState<EntryKind>(preselected.startsWith("team:") ? "team" : "agent");
  const [workspaceId, setWorkspaceId] = useState(workspace.current?.id ?? "");
  const [title, setTitle] = useState(""); const [search, setSearch] = useState("");
  const [policy, setPolicy] = useState<Session["message_policy"]>("queue");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
  const ambiguous = error instanceof ApiError && error.code === "ENTRY_KIND_AMBIGUOUS";
  const locked = Boolean(preselected) && !ambiguous;
  const body = { workspace_id: workspaceId, entry_kind: kind, entry_ref: entry.slice(entry.indexOf(":") + 1), title, message_policy: policy };
  const intent = useIdempotencyIntent(body);
  const needle = search.trim().toLowerCase();
  const visible = (entries.data ?? []).filter((item) => !needle || `${item.display_name ?? ""} ${item.publisher}/${item.name}`.toLowerCase().includes(needle) || entry === `${item.kind}:${item.publisher}/${item.name}`);
  const selected = (entries.data ?? []).find((item) => `${item.kind}:${item.publisher}/${item.name}` === entry);
  function choose(item: Asset) {
    setEntry(`${item.kind}:${item.publisher}/${item.name}`);
    setKind(item.kind === "team" ? "team" : "agent");
  }
  return <Dialog title="新建会话" onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(undefined); void createSession(body, intent.key).then((session) => { intent.succeeded(); onCreated(session); }, setError).finally(() => setBusy(false)); }}>
    {selected ? <Chosen asset={selected} /> : <p className="text-body text-muted-foreground">先选一位专家或一个专家团</p>}
    {locked ? null : (
      <div className="max-h-64 space-y-1 overflow-auto rounded-card bg-muted p-2">
        <Input aria-label="搜索专家" value={search} placeholder="搜索专家" onChange={(event) => setSearch(event.target.value)} />
        <Group label="专家" items={visible.filter((item) => item.kind === "agent")} selected={entry} onChoose={choose} />
        <Group label="专家团" items={visible.filter((item) => item.kind === "team")} selected={entry} onChoose={choose} />
      </div>
    )}
    <div className="sr-only">
      <Field label="工作空间"><Select className="w-full" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspace.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="入口类型"><Select className="w-full" value={kind} disabled={locked} onChange={(event) => { setKind(event.target.value as EntryKind); setEntry(""); }}><option value="agent">专家</option><option value="team">专家团</option></Select></Field>
      <EntryPicker entries={(entries.data ?? []).filter((item) => `${item.publisher}/${item.name}`.includes(search) || entry === `${item.kind}:${item.publisher}/${item.name}`)} value={entry} kind={locked ? kind : undefined} onChange={(value) => { setEntry(value); setKind(value.split(":")[0] as EntryKind); }} />
    </div>
    <Field label="标题"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这次对话起个名字，可留空" /></Field>
    <div className="flex flex-wrap gap-2" role="group" aria-label="消息策略">
      {Object.entries(policyLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={policy === value} className={cn("h-8 rounded-full px-3 text-body", policy === value ? "bg-primary-100 font-medium text-primary-700" : "bg-secondary text-gray-700 hover:bg-gray-200")} onClick={() => setPolicy(value as Session["message_policy"])}>{label}</button>)}
    </div>
    {error ? <Alert>{describeFailure("操作失败", error)}</Alert> : null}{entries.error ? <Alert>{describeFailure("操作失败", entries.error)}</Alert> : null}
    <div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="submit" variant="primary" disabled={busy || !entry || !workspaceId}>创建会话</Button></div>
  </form></Dialog>;
}
function Chosen({ asset }: { asset: Asset }) {
  const title = asset.display_name || asset.name;
  return <div className="flex items-start gap-3 rounded-card bg-muted p-4">
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-primary-100 text-title font-medium text-primary-700">{title.slice(0, 1)}</span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-2"><p className="text-title font-semibold text-foreground">{title}</p><span className="rounded-full bg-secondary px-2 text-caption text-muted-foreground">{asset.kind === "team" ? "专家团" : "专家"}</span></div>
      <p className="mt-1 font-mono text-small text-muted-foreground">{asset.publisher}/{asset.name}</p>
      <p className="mt-2 text-body leading-6 text-gray-700">{asset.description || "暂无简介"}</p>
    </div>
  </div>;
}
function Group({ label, items, selected, onChoose }: { label: string; items: readonly Asset[]; selected: string; onChoose(asset: Asset): void }) {
  return <div><p className="px-2 pb-1 pt-2 text-caption font-medium text-muted-foreground">{label}</p>{items.length ? items.map((item) => {
    const value = `${item.kind}:${item.publisher}/${item.name}`;
    return <button key={item.id} type="button" className={cn("flex w-full items-start gap-2 rounded-control px-2 py-2 text-left hover:bg-card", selected === value && "bg-card")} onClick={() => onChoose(item)}>{item.kind === "team" ? <Users aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" /> : <Bot aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" />}<span className="min-w-0"><span className="block truncate text-body font-medium">{item.display_name || item.name}</span><span className="block truncate text-small text-muted-foreground">{item.description || `${item.publisher}/${item.name}`}</span></span></button>;
  }) : <p className="px-2 py-1 text-caption text-muted-foreground">没有匹配的{label}</p>}</div>;
}
