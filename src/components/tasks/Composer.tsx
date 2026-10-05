import { ArrowUp, Play, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { mentionColor, parseMentions, type ChatMember } from "../../lib/chat";
import { roleName } from "../../lib/display";
import { Avatar } from "../TeamAvatars";
import { MentionChip } from "../conversation/MentionChip";
import { COARSE_POINTER, useMediaQuery } from "../../lib/useMediaQuery";
import type { ConfigCatalog } from "../../lib/configCatalog";
import type { TaskConfigState } from "../../lib/useTaskConfig";
import { ConfigChips } from "./ConfigChips";
import { FileChips, filesToAttachmentText, useLocalFiles } from "./LocalFiles";
import { ConfigMenu } from "./ConfigMenu";
import { PermissionChip } from "./PermissionChip";

interface ComposerProps {
  readonly onSend: (text: string, delivery: "queue" | "interrupt", mentions: readonly string[]) => Promise<void>;
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
  /** 任务有专家团时：输入「@」可以点名成员。没有就和以前一样。 */
  readonly team?: { readonly leader: string; readonly members: readonly ChatMember[] } | null;
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

export function Composer({ onSend, onControl, status, closed = false, attention = false, config, catalog, team = null }: ComposerProps) {
  const touch = useMediaQuery(COARSE_POINTER);
  const [draft, setDraft] = useState("");
  // The members picked for this message (chips above the text), and the picker that offers them when "@" is typed.
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const options = team && query !== null ? team.members.filter((member) => `${member.label ?? ""}${member.role}${member.name ?? ""}`.toLowerCase().includes(query.toLowerCase())) : [];
  const picking = options.length > 0;
  /** "@" typed at the start of a word, up to the caret: what has been typed after it is the query. */
  const readQuery = (text: string, caret: number): string | null => (team ? (/(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))?.[2] ?? null) : null);
  const choose = (member: ChatMember) => {
    const el = field.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@[^\s@]*$/, "");
    const next = before + draft.slice(caret);
    setDraft(next);
    setPicked((current) => (current.includes(member.role) ? current : [...current, member.role]));
    setQuery(null);
    setActive(0);
    requestAnimationFrame(() => {
      el?.focus();
      // Only if nothing has been typed since: the caret must not jump back over what came after the pick.
      if (el && el.value === next) el.setSelectionRange(before.length, before.length);
    });
  };
  const local = useLocalFiles();
  const [fileNotice, setFileNotice] = useState("");
  const empty = !draft.trim();
  const action = composerAction(status, !empty);
  const { label, Icon } = LOOK[action];
  const send = async (delivery: "queue" | "interrupt") => {
    if (empty || closed) return;
    // 附件读成文本并入消息；带不走的（超大/二进制）留个提示，消息照发。
    const { text, warnings } = await filesToAttachmentText(local.files);
    // The chips, and anyone @-ed by name in the text.
    const mentions = team ? [...new Set([...picked, ...parseMentions(draft, team.members)])] : [];
    await onSend(draft.trim() + text, delivery, mentions);
    setDraft("");
    setPicked([]);
    setQuery(null);
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
          {team && picked.length > 0 ? (
            <ul aria-label="已 @ 的成员" className="flex flex-wrap items-center gap-1 px-4 pt-3">
              {picked.map((role) => (
                <li key={role} className="flex items-center" data-testid="composer-mention">
                  <MentionChip role={role} team={team} className="mx-0" />
                  <button type="button" aria-label={`取消 @${roleName(role, team.members.find((m) => m.role === role)?.label, team.leader)}`} className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-200" onClick={() => setPicked((current) => current.filter((item) => item !== role))}>
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {picking && team ? (
            <ul role="listbox" aria-label="点名成员" data-testid="mention-picker" className="mx-2 mt-2 max-h-48 overflow-y-auto rounded-card bg-card p-1 shadow-lg ring-1 ring-border">
              {options.map((member, index) => (
                <li key={member.role} role="option" aria-selected={index === active} data-role={member.role}>
                  <button type="button" tabIndex={-1} className={cn("flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-body text-foreground hover:bg-secondary", index === active && "bg-secondary")} onMouseDown={(event) => { event.preventDefault(); choose(member); }}>
                    <Avatar name={member.name || roleName(member.role, member.label, team.leader)} tone={mentionColor(member.role, team)} />
                    <span className="min-w-0 flex-1 truncate">{roleName(member.role, member.label, team.leader)}{member.name ? <span className="text-muted-foreground"> · {member.name}</span> : null}</span>
                    {member.role === team.leader ? <span className="shrink-0 rounded-control bg-primary-100 px-1.5 text-caption font-medium text-primary-700">领队</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-start">
            {config && catalog ? <ConfigChips draft={config.draft} onChange={config.apply} catalog={catalog} /> : null}
            <FileChips files={local.files} onRemove={local.removeAt} />
            <textarea
              value={draft}
              disabled={closed}
              rows={2}
              placeholder={closed ? "任务已取消，新建任务继续" : "向任务发送消息"}
              className="block max-h-48 min-h-[3.5rem] min-w-0 flex-1 resize-none bg-transparent px-4 pt-3 text-body text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
              ref={field}
              onChange={(e) => {
                setDraft(e.target.value);
                setQuery(readQuery(e.target.value, e.target.selectionStart));
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (picking) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((index) => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
                    return;
                  }
                  if ((event.key === "Enter" && !event.nativeEvent.isComposing) || event.key === "Tab") {
                    event.preventDefault();
                    choose(options[active] ?? options[0]);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setQuery(null);
                    return;
                  }
                }
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
