import { useEffect, useRef } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { Turn } from "../../lib/conversation";
import { AgentMessage } from "./AgentMessage";
import { UserMessage } from "./UserMessage";

interface ConversationProps {
  readonly turns: readonly Turn[];
  readonly profile: string;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  /** 放在对话最下面的内联卡片：审批、Agent 提问。 */
  readonly children?: React.ReactNode;
}

const NEAR_BOTTOM_PX = 120;

/** 对话滚动区。新内容到达时，如果你本来就在底部附近就跟到底部；你往上翻看历史时不打扰。 */
export function Conversation({ turns, profile, files, onOpenFile, onOpenAllFiles, children }: ConversationProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastAgentIndex = turns.reduce((last, turn, index) => (turn.kind === "agent" ? index : last), -1);
  const size = turns.reduce((sum, turn) => sum + (turn.kind === "agent" ? turn.text.length + turn.steps.length : turn.text.length), 0);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns.length, size, files.length]);

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        const el = event.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
    >
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {turns.map((turn, index) => {
          if (turn.kind === "user") return <UserMessage key={turn.id} turn={turn} />;
          // 产物属于产出它的那次尝试；没有尝试归属的产物放在最后一条回复下面。
          const own = files.filter((file) => file.attemptId === turn.id || (file.attemptId === "" && index === lastAgentIndex));
          return <AgentMessage key={turn.id} turn={turn} profile={profile} files={own} onOpenFile={onOpenFile} onOpenAllFiles={onOpenAllFiles} />;
        })}
        {children}
      </div>
    </div>
  );
}
