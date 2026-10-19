import { useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError, describeFailure } from "../../api/errors";
import type { EntryKind, Session } from "../../api/types";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
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
  return <Dialog title="新建会话" onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(undefined); void createSession(body, intent.key).then((session) => { intent.succeeded(); onCreated(session); }, setError).finally(() => setBusy(false)); }}>
    <Field label="工作空间"><Select className="w-full" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspace.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
    <Field label="搜索入口"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
    <Field label="入口类型"><Select className="w-full" value={kind} disabled={locked} onChange={(event) => { setKind(event.target.value as EntryKind); setEntry(""); }}><option value="agent">专家</option><option value="team">专家团</option></Select></Field>
    <EntryPicker entries={(entries.data ?? []).filter((item) => `${item.publisher}/${item.name}`.includes(search) || entry === `${item.kind}:${item.publisher}/${item.name}`)} value={entry} kind={locked ? kind : undefined} onChange={(value) => { setEntry(value); setKind(value.split(":")[0] as EntryKind); }} />
    <Field label="标题"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="可留空" /></Field>
    <Field label="消息策略"><Select className="w-full" value={policy} onChange={(event) => setPolicy(event.target.value as typeof policy)}>{Object.entries(policyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    <p className="text-caption text-muted-foreground">排队等待当前运行结束；插话加入当前运行；打断停止当前运行后开始。</p>
    {error ? <Alert>{describeFailure("操作失败", error)}</Alert> : null}{entries.error ? <Alert>{describeFailure("操作失败", entries.error)}</Alert> : null}
    <div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="submit" variant="primary" disabled={busy || !entry || !workspaceId}>创建会话</Button></div>
  </form></Dialog>;
}
