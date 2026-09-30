import { useState } from "react";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/fields";

interface ComposerProps {
  readonly onSend: (text: string, delivery: "queue" | "interrupt") => Promise<void>;
}

export function Composer({ onSend }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const empty = !draft.trim();
  const send = async (delivery: "queue" | "interrupt") => {
    if (empty) return;
    await onSend(draft.trim(), delivery);
    setDraft("");
  };
  return (
    <div className="border-t border-border p-4">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(event) => {
            // Enter 发送，Shift+Enter 换行；输入法选字期间的 Enter 不算发送。
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              void send("queue");
            }
          }}
          placeholder="向任务发送消息"
          className="h-12 min-w-0 flex-1 resize-none"
        />
        <Button variant="primary" className="h-12" disabled={empty} onClick={() => void send("queue")}>
          发送
        </Button>
        <Button title="立即中断当前执行，并把这条消息交给 Agent" className="h-12" disabled={empty} onClick={() => void send("interrupt")}>
          打断
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Enter 发送，Shift+Enter 换行。「打断」会中止正在执行的尝试。</p>
    </div>
  );
}
