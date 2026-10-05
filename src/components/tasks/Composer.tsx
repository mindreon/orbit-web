import { ArrowUp, Play, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { COARSE_POINTER, useMediaQuery } from "../../lib/useMediaQuery";
import type { ConfigCatalog } from "../../lib/configCatalog";
import type { TaskConfigState } from "../../lib/useTaskConfig";
import { ConfigChips } from "./ConfigChips";
import { FileChips, filesToAttachmentText, useLocalFiles } from "./LocalFiles";
import { ConfigMenu } from "./ConfigMenu";
import { PermissionChip } from "./PermissionChip";

interface ComposerProps {
  readonly onSend: (text: string, delivery: "queue" | "interrupt") => Promise<void>;
  /** 停止正在执行的，或接着做被停住的。 */
  readonly onControl: (action: "stop" | "resume") => void;
  readonly status: string;
  /** 任务已取消，不能再发消息。 */
  readonly closed?: boolean;
  /** 页面上有一张「需要你」的提示卡：输入框的停止/继续退成次要按钮，别和卡片上的主按钮抢。 */
  readonly attention?: boolean;
  /** 任务带着什么运行（专家、技能、连接器、模式），可以在这里中途修改。 */
  readonly config?: TaskConfigState;
  readonly catalog?: ConfigCatalog;
}

/** 输入框右下角只有一个按钮，它的样子就是点下去会发生什么：发送；任务在跑、没有要发的话时停止；停住后继续。 */
export type ComposerAction = "send" | "stop" | "continue";

const RUNNING = ["RUNNING", "PLANNING", "WAITING"];

export function composerAction(status: string, hasDraft: boolean): ComposerAction {
  if (hasDraft) return "send";
  if (status === "PAUSED" || status === "PAUSED_NEEDS_REVIEW") return "continue";
  return RUNNING.includes(status) ? "stop" : "send";
}

const LOOK: Record<ComposerAction, { label: string; Icon: typeof ArrowUp }> = {
  send: { label: "发送", Icon: ArrowUp },
  stop: { label: "停止", Icon: Square },
  continue: { label: "继续", Icon: Play },
};

export function Composer({ onSend, onControl, status, closed = false, attention = false, config, catalog }: ComposerProps) {
  const touch = useMediaQuery(COARSE_POINTER);
  const [draft, setDraft] = useState("");
  const local = useLocalFiles();
  const [fileNotice, setFileNotice] = useState("");
  const empty = !draft.trim();
  const action = composerAction(status, !empty);
  const { label, Icon } = LOOK[action];
  const send = async (delivery: "queue" | "interrupt") => {
    if (empty || closed) return;
    // 附件读成文本并入消息；带不走的（超大/二进制）留个提示，消息照发。
    const { text, warnings } = await filesToAttachmentText(local.files);
    await onSend(draft.trim() + text, delivery);
    setDraft("");
    local.clear();
    setFileNotice(warnings.join("；"));
  };
  const click = () => {
    if (action === "stop") onControl("stop");
    else if (action === "continue") onControl("resume");
    else void send("queue");
  };
  return (
    <div className="shrink-0 px-4 pb-3 pt-2 sm:px-6">
      <div className="mx-auto max-w-reading text-body">
        <div className="rounded-card bg-card shadow-md ring-1 ring-border focus-within:ring-primary-500">
          {local.input}
          <div className="flex items-start">
            {config && catalog ? <ConfigChips draft={config.draft} onChange={config.apply} catalog={catalog} /> : null}
            <FileChips files={local.files} onRemove={local.removeAt} />
            <textarea
              value={draft}
              disabled={closed}
              rows={2}
              placeholder={closed ? "任务已取消，新建任务继续" : "向任务发送消息"}
              className="block max-h-48 min-h-[3.5rem] min-w-0 flex-1 resize-none bg-transparent px-4 pt-3 text-body text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                // Enter 发送，Shift+Enter 换行，⌘/Ctrl+Enter 打断当前执行并发送；输入法选字期间的 Enter 不算发送。
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  void send(event.metaKey || event.ctrlKey ? "interrupt" : "queue");
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 px-2 pb-2">
            {config && catalog ? <ConfigMenu draft={config.draft} onChange={config.apply} catalog={catalog} disabled={closed || !config.ready} onAddFile={local.pick} /> : null}
            <PermissionChip />
            <span className="ml-auto" />
            <button
              type="button"
              aria-label={label}
              title={action === "stop" ? "停止当前执行" : action === "continue" ? "继续执行" : "发送（⌘/Ctrl+Enter 打断当前执行并发送）"}
              data-testid="composer-action"
              data-state={action}
              disabled={action === "send" && (empty || closed)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full disabled:bg-secondary disabled:text-gray-500",
                action !== "send" && attention ? "bg-secondary text-gray-700 hover:bg-gray-200" : "bg-primary text-primary-foreground hover:bg-primary-hover",
                action === "stop" && !attention ? "ring-2 ring-primary-200" : "",
              )}
              onClick={click}
            >
              <Icon className={cn("h-4 w-4", action === "stop" ? "fill-current" : "")} />
            </button>
          </div>
        </div>
        {fileNotice ? <p role="status" className="mt-2 text-center text-caption text-warning-700">{fileNotice}</p> : null}
        {config?.notice ? <p role="status" data-testid="config-notice" className="mt-2 text-center text-caption text-muted-foreground">{config.notice}</p> : null}
        {config?.error ? <p role="alert" className="mt-2 text-center text-caption text-danger-700">{config.error}</p> : null}
        <p className="mt-2 text-center text-caption text-muted-foreground">内容由 AI 生成，请核实重要信息。{touch ? "" : "Enter 发送，Shift+Enter 换行，⌘/Ctrl+Enter 打断并发送。"}</p>
      </div>
    </div>
  );
}
