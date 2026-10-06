import { ChevronRight, ClipboardCheck } from "lucide-react";
import { useId, useState } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { AgentTurn } from "../../lib/conversation";
import { useDeveloperMode } from "../../lib/devMode";
import { roleText, type NodeRole } from "../../lib/display";
import { replyTime } from "../../lib/activity";
import { RichText } from "../markdown/RichText";
import { StatusBadge } from "../../ui/StatusBadge";
import { Avatar } from "../TeamAvatars";
import { attemptStatusText, failureClassText, statusTone } from "../tasks/statusText";
import { ActivityTimeline, useExpansion } from "./ActivityTimeline";
import { ArtifactCards } from "./ArtifactCards";
import { ProcessHeader } from "./ProcessHeader";
import { ActionRow, CopyButton, UsageButton } from "./ReplyActions";

interface AgentMessageProps {
  readonly turn: AgentTurn;
  /** 脚注里的专家名（显示名，不是 id@版本）。 */
  readonly expertName: string;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  /** 整个任务的产物数，写在「查看所有产物」里。 */
  readonly totalFiles?: number;
  /** Who the node of this reply belongs to: a member (shown above the reply), the leader's review (shown above it too), or the leader (no label: it is the main speaker). */
  readonly speaker?: NodeRole;
  readonly nameOf?: (ref: string) => string;
  /** The last reply of the conversation: its action row stays visible instead of waiting for the pointer. */
  readonly last?: boolean;
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

/**
 * 一次尝试对应一条 Agent 回复：先是一行「已处理 1m 41s」，下面是过程（每轮模型的话和工具调用，按发生的先后），
 * 然后是最终回复、产物，最后是操作行。回复结束后过程默认折起，最终回复始终可见。
 */
export function AgentMessage({ turn, expertName, files, onOpenFile, onOpenAllFiles, totalFiles, speaker, nameOf, last = false }: AgentMessageProps) {
  const developer = useDeveloperMode();
  const processId = useId();
  const expansion = useExpansion();
  const [override, setOverride] = useState<boolean | null>(null);
  const done = turn.status === "completed" || turn.status === "failed" || turn.status === "cancelled";
  const active = turn.status === "running" || turn.status === "parked_approval" || turn.status === "parked_input";
  const showThinking = developer && turn.thinking !== "";
  const hasProcess = turn.segments.length > 0 || showThinking;
  // 回复结束后过程默认折起；你点过之后以你的为准。
  const open = override ?? !done;
  const labelled = speaker && speaker.kind !== "leader" ? speaker : undefined;
  // The footer names whoever answered: the member's expert, not the task's (the leader's).
  const footerName = speaker?.name || expertName;
  return (
    <div data-testid="agent-message" data-status={turn.status} data-speaker={speaker?.kind} className="group/msg relative space-y-3">
      {labelled ? (
        <p data-testid="speaker" data-kind={labelled.kind} data-role={labelled.role} className="flex items-center gap-1.5 text-small font-medium text-gray-700">
          {labelled.kind === "review" ? <ClipboardCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" /> : <Avatar name={labelled.name || (nameOf ? nameOf(labelled.expert) : "")} tone={1} />}
          <span data-testid="speaker-label">{roleText(labelled, nameOf)}</span>
        </p>
      ) : null}
      <ProcessHeader
        status={turn.status}
        startedAt={turn.at}
        finishedAt={turn.finishedAt}
        working={turn.segments.length > 0 || turn.answer !== ""}
        expandable={hasProcess}
        open={open}
        onToggle={() => setOverride(!open)}
        controls={processId}
      />
      {hasProcess && open ? (
        <div id={processId} data-testid="process" className="space-y-2">
          {showThinking ? <Thinking text={turn.thinking} open={turn.status === "running" && turn.answer === "" && turn.segments.length === 0} /> : null}
          <ActivityTimeline segments={turn.segments} active={active} expansion={expansion} />
        </div>
      ) : null}
      {turn.answer !== "" ? (
        turn.streaming ? (
          <article data-testid="live-output">
            {turn.truncated ? (
              <p className="mb-1 text-caption text-muted-foreground">
                <span data-testid="truncated-badge" className="rounded-control bg-warning-100 px-1.5 text-warning-700">已截断</span>
              </p>
            ) : null}
            <RichText text={turn.answer} streaming={turn.status === "running"} />
          </article>
        ) : (
          <article data-testid="final-output">
            <RichText text={turn.answer} />
          </article>
        )
      ) : null}
      {/* 等待审批/等待回复不再单独标一个徽章：开头那行、下面的提示卡、页头状态和输入框已经说了同一件事 */}
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
      <ArtifactCards files={files} total={totalFiles} onOpen={onOpenFile} onOpenAll={onOpenAllFiles} />
      {done ? (
        <ActionRow testId="reply-actions" always={last}>
          {turn.answer || turn.text ? <CopyButton text={turn.answer || turn.text} label="复制回复" /> : null}
          <span className="tabular-nums">{replyTime(turn.finishedAt ?? turn.at)}</span>
          <span>{footerName}</span>
          {turn.usage ? <UsageButton usage={turn.usage} /> : null}
        </ActionRow>
      ) : null}
    </div>
  );
}
