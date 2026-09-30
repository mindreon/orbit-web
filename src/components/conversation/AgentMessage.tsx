import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { AgentTurn } from "../../lib/conversation";
import { shortDateTime } from "../../lib/time";
import { RichText } from "../markdown/RichText";
import { StatusBadge } from "../../ui/StatusBadge";
import { attemptStatusText, statusTone } from "../tasks/statusText";
import { ArtifactCards } from "./ArtifactCards";
import { StepList } from "./StepList";

interface AgentMessageProps {
  readonly turn: AgentTurn;
  readonly profile: string;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="复制回复"
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** 一次尝试对应一条 Agent 回复：先是执行步骤，再是回复正文，最后是产物和脚注。 */
export function AgentMessage({ turn, profile, files, onOpenFile, onOpenAllFiles }: AgentMessageProps) {
  const done = turn.status === "completed" || turn.status === "failed" || turn.status === "cancelled";
  const thinking = turn.status === "running" && turn.text === "" && turn.steps.length === 0;
  return (
    <div data-testid="agent-message" data-status={turn.status} className="space-y-3">
      <StepList steps={turn.steps} active={turn.status === "running"} />
      {thinking ? <p className="text-sm text-muted-foreground">正在思考…</p> : null}
      {turn.text !== "" ? (
        turn.streaming ? (
          <article data-testid="live-output">
            <p className="mb-1 text-xs text-muted-foreground">
              正在输出…{turn.truncated ? <span data-testid="truncated-badge" className="ml-2 rounded bg-warning/10 px-1 text-warning">已截断</span> : null}
            </p>
            <RichText text={turn.text} streaming />
          </article>
        ) : (
          <article data-testid="final-output">
            <p className="mb-1 text-xs text-muted-foreground">Attempt #{turn.attemptNo} 输出</p>
            <RichText text={turn.text} />
          </article>
        )
      ) : null}
      {turn.status === "failed" || turn.status === "cancelled" || turn.status === "parked_approval" || turn.status === "parked_input" ? (
        <StatusBadge tone={statusTone(turn.status)}>{attemptStatusText[turn.status]}</StatusBadge>
      ) : null}
      <ArtifactCards files={files} onOpen={onOpenFile} onOpenAll={onOpenAllFiles} />
      {done ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {turn.text ? <CopyButton text={turn.text} /> : null}
          <span>{profile}</span>
          <span>{shortDateTime(turn.at)}</span>
        </div>
      ) : null}
    </div>
  );
}
