import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { PermissionChip } from "./PermissionChip";

interface ComposerProps {
  readonly onSend: (text: string, delivery: "queue" | "interrupt") => Promise<void>;
  /** 任务已结束，不能再发消息。 */
  readonly closed?: boolean;
}

export function Composer({ onSend, closed = false }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const empty = !draft.trim();
  const send = async (delivery: "queue" | "interrupt") => {
    if (empty || closed) return;
    await onSend(draft.trim(), delivery);
    setDraft("");
  };
  return (
    <div className="shrink-0 px-6 pb-3 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-primary/50">
          <textarea
            value={draft}
            disabled={closed}
            rows={2}
            placeholder={closed ? "任务已结束，新建任务继续" : "向任务发送消息"}
            className="block max-h-48 min-h-[3.5rem] w-full resize-none bg-transparent px-4 pt-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(event) => {
              // Enter 发送，Shift+Enter 换行；输入法选字期间的 Enter 不算发送。
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                void send("queue");
              }
            }}
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <PermissionChip />
            <span className="ml-auto" />
            <Button size="sm" title="立即中断当前执行，并把这条消息交给 Agent" disabled={empty || closed} onClick={() => void send("interrupt")}>
              打断
            </Button>
            <button
              type="button"
              aria-label="发送"
              disabled={empty || closed}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground"
              onClick={() => void send("queue")}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">内容由 AI 生成，请核实重要信息。Enter 发送，Shift+Enter 换行。</p>
      </div>
    </div>
  );
}
