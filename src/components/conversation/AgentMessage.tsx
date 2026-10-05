import { Check, ChevronRight, ClipboardCheck, Copy } from "lucide-react";
import { useState } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { AgentTurn } from "../../lib/conversation";
import { roleText, type NodeRole } from "../../lib/display";
import { shortDateTime } from "../../lib/time";
import { RichText } from "../markdown/RichText";
import { StatusBadge } from "../../ui/StatusBadge";
import { Avatar } from "../TeamAvatars";
import { attemptStatusText, failureClassText, statusTone } from "../tasks/statusText";
import { ArtifactCards } from "./ArtifactCards";
import { StepList } from "./StepList";

interface AgentMessageProps {
  readonly turn: AgentTurn;
  /** 脚注里的专家名（显示名，不是 id@版本）。 */
  readonly expertName: string;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  /** Who the node of this reply belongs to: a member (shown above the reply), the leader's review (shown above it too), or the leader (no label: it is the main speaker). */
  readonly speaker?: NodeRole;
  readonly nameOf?: (ref: string) => string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="复制回复"
      className="flex h-7 w-7 items-center justify-center rounded-control text-gray-500 hover:bg-gray-100 hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-4 w-4 text-success-700" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** 模型的推理（独立字段流出的，或写进回复里的）：默认折起，不和回复正文混在一起；正文开始前跟着流式展开。 */
function Thinking({ text, open }: { text: string; open: boolean }) {
  return (
    <details data-testid="thinking" open={open} className="group rounded-card bg-muted text-body">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        思考过程
      </summary>
      <p className="whitespace-pre-wrap px-3 pb-3 pt-1 text-small text-muted-foreground">{text}</p>
    </details>
  );
}

/** 一次尝试对应一条 Agent 回复：先是执行步骤，再是回复正文，最后是产物和脚注。 */
export function AgentMessage({ turn, expertName, files, onOpenFile, onOpenAllFiles, speaker, nameOf }: AgentMessageProps) {
  const done = turn.status === "completed" || turn.status === "failed" || turn.status === "cancelled";
  const thinking = turn.status === "running" && turn.text === "" && turn.thinking === "" && turn.steps.length === 0;
  const labelled = speaker && speaker.kind !== "leader" ? speaker : undefined;
  // The footer names whoever answered: the member's expert, not the task's (the leader's).
  const footerName = speaker?.name || expertName;
  return (
    <div data-testid="agent-message" data-status={turn.status} data-speaker={speaker?.kind} className="space-y-3">
      {labelled ? (
        <p data-testid="speaker" data-kind={labelled.kind} data-role={labelled.role} className="flex items-center gap-1.5 text-small font-medium text-gray-700">
          {labelled.kind === "review" ? <ClipboardCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" /> : <Avatar name={labelled.name || (nameOf ? nameOf(labelled.expert) : "")} tone={1} />}
          <span data-testid="speaker-label">{roleText(labelled, nameOf)}</span>
        </p>
      ) : null}
      <StepList steps={turn.steps} active={turn.status === "running"} />
      {thinking ? <p className="text-body text-muted-foreground">正在思考…</p> : null}
      {turn.thinking !== "" ? <Thinking text={turn.thinking} open={turn.status === "running" && turn.text === ""} /> : null}
      {turn.text !== "" ? (
        turn.streaming ? (
          <article data-testid="live-output">
            <p className="mb-1 text-caption text-muted-foreground">
              {turn.status === "running" ? "正在输出…" : turn.status === "parked_approval" ? "等待你的确认" : "等待你的回答"}
              {turn.truncated ? <span data-testid="truncated-badge" className="ml-2 rounded-control bg-warning-100 px-1.5 text-warning-700">已截断</span> : null}
            </p>
            <RichText text={turn.text} streaming={turn.status === "running"} />
          </article>
        ) : (
          <article data-testid="final-output">
            <RichText text={turn.text} />
          </article>
        )
      ) : null}
      {/* 等待审批/等待回复不再单独标一个徽章：下面的提示卡、页头状态和输入框已经说了同一件事 */}
      {turn.status === "failed" || turn.status === "cancelled" ? (
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(turn.status)}>{attemptStatusText[turn.status]}</StatusBadge>
          {turn.status === "failed" && turn.failure ? (
            <span data-testid="failure-class" data-failure-class={turn.failure.failureClass} className="text-caption text-muted-foreground">
              {failureClassText[turn.failure.failureClass] ?? turn.failure.failureClass}
            </span>
          ) : null}
        </p>
      ) : null}
      <ArtifactCards files={files} onOpen={onOpenFile} onOpenAll={onOpenAllFiles} />
      {done ? (
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          {turn.text ? <CopyButton text={turn.text} /> : null}
          <span>{footerName}</span>
          <span>{shortDateTime(turn.at)}</span>
        </div>
      ) : null}
    </div>
  );
}
