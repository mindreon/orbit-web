import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeFailure } from "../../api/errors";
import type { S } from "../../api/types";
import { EntryPicker } from "../../components/EntryPicker";
import { describeCron, nextFires } from "../../lib/cron";
import { useEntries } from "../../platform/entries";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field, Input, Select, Textarea } from "../../ui/fields";
import { createSchedule, patchSchedule } from "./api";
import { budgetToMillicredits, scheduleFieldErrors } from "./form";
import { overlapLabels } from "./labels";
export function ScheduleForm({ schedule }: { schedule?: S["Schedule"] }) {
  const { currentTenant } = useIdentity(); const { current } = useWorkspace(); const entries = useEntries(); const navigate = useNavigate(); const cache = useQueryClient();
  const [name, setName] = useState(schedule?.name ?? ""); const [description, setDescription] = useState(schedule?.description ?? "");
  const [entry, setEntry] = useState(schedule ? `${schedule.entry_kind}:${schedule.entry_ref}` : "");
  const [prompt, setPrompt] = useState(schedule?.prompt ?? ""); const [cron, setCron] = useState(schedule?.cron ?? "0 3 * * *");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [budget, setBudget] = useState(String((schedule?.budget_millicredits ?? 100000) / 1000));
  const [overlap, setOverlap] = useState<S["ScheduleCreate"]["overlap_policy"]>(schedule?.overlap_policy ?? "skip");
  const [catchup, setCatchup] = useState(schedule?.catchup_window_seconds ?? 3600);
  const [error, setError] = useState<unknown>(); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const form = useRef<HTMLFormElement>(null);
  const fires = useMemo(() => nextFires(cron, timezone), [cron, timezone]);
  const millicredits = budgetToMillicredits(budget);
  const body: S["ScheduleCreate"] = { workspace_id: schedule?.workspace_id ?? current?.id ?? "", name, description, entry_kind: entry.startsWith("team:") ? "team" : "agent", entry_ref: entry.slice(entry.indexOf(":") + 1), prompt, cron, timezone, budget_millicredits: millicredits ?? 0, overlap_policy: overlap, catchup_window_seconds: catchup };
  const intent = useIdempotencyIntent(body);
  const focus = (errors: Record<string, string>) => requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]?.replace(/[^a-zA-Z0-9_]/g, "")}"]`)?.focus());
  return <form ref={form} className="max-w-reading space-y-6" onSubmit={(event) => {
    event.preventDefault(); const invalid: Record<string, string> = millicredits === null ? { budget_millicredits: "预算至少为 1 积分，最多三位小数" } : {};
    if (new TextEncoder().encode(prompt).length > 32768) invalid.prompt = "提示词不能超过 32768 字节";
    if (Object.keys(invalid).length) { setFields(invalid); focus(invalid); return; }
    setFields({});
    setBusy(true); setError(undefined);
    const { workspace_id: _workspace, entry_kind: _kind, entry_ref: _entry, ...patch } = body;
    void (schedule ? patchSchedule(schedule.id, patch, intent.key) : createSchedule(body, intent.key)).then(async (saved) => {
      intent.succeeded(); await cache.invalidateQueries({ queryKey: qk.scheduleLists(currentTenant?.id ?? null) }); await cache.invalidateQueries({ queryKey: qk.schedule(currentTenant?.id ?? null, saved.id) }); navigate(`/schedules/${saved.id}`);
    }, (failure) => { const errors = scheduleFieldErrors(failure); setFields(errors); setError(failure); focus(errors); }).finally(() => setBusy(false));
  }}>
    <section className="space-y-4"><h2 className="text-small font-medium text-muted-foreground">基本</h2><Field label="名称" error={fields.name}><Input name="name" required maxLength={128} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="描述" error={fields.description}><Textarea name="description" maxLength={1024} value={description} onChange={(e) => setDescription(e.target.value)} /></Field></section>
    <section className="space-y-4"><h2 className="text-small font-medium text-muted-foreground">运行</h2>{schedule ? <p className="text-small">入口不可修改：<code>{schedule.entry_ref}</code></p> : <EntryPicker entries={entries.data ?? []} value={entry} onChange={setEntry} />}{fields.entry_ref ? <p className="text-small text-danger-700">{fields.entry_ref}</p> : null}{entries.error ? <Alert>{describeFailure("入口加载失败", entries.error)}</Alert> : null}<Field label="提示词" error={fields.prompt}><Textarea name="prompt" required rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field></section>
    <section className="space-y-4"><h2 className="text-small font-medium text-muted-foreground">时间</h2><Field label="cron" error={fields.cron}><Input name="cron" className="font-mono" required value={cron} onChange={(e) => setCron(e.target.value)} /></Field><div aria-live="polite" className="space-y-1 text-small text-muted-foreground"><p>{describeCron(cron)}</p>{fires.map((fire) => <p key={fire} className="font-mono text-caption">{new Date(fire).toLocaleString("zh-CN", { timeZone: timezone })}</p>)}{!fires.length ? <p>没有可预览的触发时间</p> : null}</div><Field label="时区" error={fields.timezone}><Select name="timezone" className="w-full font-mono" value={timezone} onChange={(e) => setTimezone(e.target.value)}>{[...new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map((zone) => <option key={zone}>{zone}</option>)}</Select></Field><Field label="重叠策略" error={fields.overlap_policy}><Select name="overlap_policy" className="w-full" value={overlap} onChange={(e) => setOverlap(e.target.value as typeof overlap)}>{Object.entries(overlapLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><Field label="补跑窗口（秒）" error={fields.catchup_window_seconds}><Input name="catchup_window_seconds" type="number" required min={60} max={86400} value={catchup} onChange={(e) => setCatchup(Number(e.target.value))} /></Field></section>
    <section className="space-y-2"><h2 className="text-small font-medium text-muted-foreground">预算</h2><Field label="预算（积分）" error={fields.budget_millicredits}><Input name="budget_millicredits" inputMode="decimal" required value={budget} onChange={(e) => setBudget(e.target.value)} /></Field><p className="font-mono text-caption text-muted-foreground">{millicredits ?? "—"} millicredits</p></section>
    {error && !Object.keys(fields).length ? <Alert>{describeFailure("保存失败", error)}</Alert> : null}<footer className="sticky bottom-0 flex justify-end gap-2 bg-muted py-3"><Button variant="ghost" onClick={() => navigate(schedule ? `/schedules/${schedule.id}` : "/schedules")}>取消</Button><Button variant="primary" type="submit" disabled={busy || !body.workspace_id || !entry}>{schedule ? "保存" : "创建定时任务"}</Button></footer>
  </form>;
}
