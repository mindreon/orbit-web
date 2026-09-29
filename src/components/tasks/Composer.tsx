import { useState } from "react";

interface ComposerProps {
  readonly onSend: (text: string, delivery: "queue" | "interrupt") => Promise<void>;
}

export function Composer({ onSend }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const send = async (delivery: "queue" | "interrupt") => {
    if (!draft.trim()) return;
    await onSend(draft.trim(), delivery);
    setDraft("");
  };
  return (
    <div className="border-t border-slate-100 p-4">
      <div className="flex gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="向任务发送消息" className="h-12 min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void send("queue")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">发送</button>
        <button type="button" onClick={() => void send("interrupt")} className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-700">打断</button>
      </div>
    </div>
  );
}
