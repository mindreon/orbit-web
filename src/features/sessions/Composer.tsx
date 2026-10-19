import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeFailure } from "../../api/errors";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
export interface SendResult { disposition?: "queued" | "steered" | "started"; position?: number; run_id?: string }
export function Composer({ onSend, active = false, status, archived = false, actionPending = false, onStop, onPause }: {
  onSend(text: string, key: string): Promise<SendResult>; active?: boolean; status?: string; archived?: boolean; actionPending?: boolean; onStop?(): void; onPause?(): void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [note, setNote] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const intent = useIdempotencyIntent(text);
  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(""), 4000); return () => clearTimeout(timer); }, [note]);
  useEffect(() => { const input = field.current; if (input) { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 224)}px`; } }, [text]);
  async function send() {
    if (busy || archived || !text.trim()) return;
    setBusy(true); setError(undefined);
    try { const response = await onSend(text, intent.key); intent.succeeded(); setText(""); setNote(response.disposition === "queued" ? `已排队（第 ${response.position ?? 1} 位）` : response.disposition === "steered" ? "已插入当前运行" : ""); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    {error ? <Alert>{error && typeof error === "object" && "status" in error && error.status === 403 ? "你没有在此会话发消息的权限" : describeFailure("操作失败", error)}</Alert> : null}
    {note ? <p role="status" className="text-caption text-muted-foreground">{note}</p> : null}
    <div className="rounded-bubble border border-gray-200 bg-card p-3"><textarea ref={field} aria-label="消息" rows={1} placeholder={archived ? "会话已归档" : "发送消息…"} className="max-h-56 min-h-8 w-full resize-none bg-transparent px-1 text-body leading-7 outline-none disabled:text-muted-foreground" value={text} disabled={archived} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className="flex items-center justify-end gap-2">
      {active ? <Button variant="ghost" size="sm" disabled={actionPending} onClick={onPause}>{status === "paused" ? "继续" : "暂停"}</Button> : null}
      {active && !text ? <button type="button" aria-label="停止" className="flex h-8 w-8 items-center justify-center rounded-control bg-gray-900 text-gray-50 disabled:opacity-40" disabled={actionPending} onClick={onStop}><Square className="h-3 w-3" fill="currentColor" /></button> : <button type="button" aria-label="发送" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" disabled={busy || archived || !text.trim()} onClick={() => void send()}><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>}
    </div></div>
  </div>;
}
