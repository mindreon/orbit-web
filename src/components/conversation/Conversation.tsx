import { useRef } from "react";
import { visibleArtifacts, type ArtifactFile } from "../../lib/artifacts";
import type { Turn } from "../../lib/conversation";
import type { NodeRole } from "../../lib/display";
import { useBottomFollow } from "../../lib/useBottomFollow";
import { AgentMessage } from "./AgentMessage";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TurnRail } from "./TurnRail";
import { UserMessage } from "./UserMessage";

interface ConversationProps {
  readonly turns: readonly Turn[];
  /** 回复脚注里的专家名（已经是显示名，不是 id@版本）。 */
  readonly expertName: string;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  /** 每个节点是谁的；回复按它的节点标出成员或复盘。 */
  readonly roles?: Readonly<Record<string, NodeRole>>;
  readonly nameOf?: (ref: string) => string;
  /** 有专家团的任务：整段对话由它画（群聊）。`size` 以前用来判断要不要跟到底部，现在靠观察内容变化，不再读它。 */
  readonly custom?: { readonly node: React.ReactNode; readonly size?: number };
  /** 放在对话最下面的内联卡片：审批、Agent 提问。 */
  readonly children?: React.ReactNode;
}

/** 对话滚动区。内容变长时，你本来在底部就一直贴着底部；你往上翻看历史时不打扰，右下出现「回到底部」；够长的对话左侧有轮次导航。 */
export function Conversation({ turns, expertName, files, onOpenFile, onOpenAllFiles, roles = {}, nameOf, custom, children }: ConversationProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const { atBottom, scrollToBottom } = useBottomFollow(scroller, column, turns[0]?.id ?? "");
  const running = turns.some((turn) => turn.kind === "agent" && turn.status === "running");
  const lastAgentIndex = turns.reduce((last, turn, index) => (turn.kind === "agent" ? index : last), -1);
  // 尝试的产物只挂在它的最后一段回复下：同一次尝试被切成多段时，卡片不重复。
  const lastIndexOfAttempt: Record<string, number> = {};
  turns.forEach((turn, index) => {
    if (turn.kind === "agent") lastIndexOfAttempt[turn.attemptId] = index;
  });
  const totalFiles = visibleArtifacts(files).length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 浏览器的滚动锚定会在内容长高时自己挪 scrollTop，和贴底打架，所以关掉 */}
      <div ref={scroller} data-testid="conversation-scroller" className="min-h-0 flex-1 overflow-y-auto" style={{ overflowAnchor: "none" }}>
        {/* 一行大约 40 个汉字：用户气泡、回复、产物卡片都在这一列里，眼睛不用来回找 */}
        <div className="px-4 py-6 sm:px-6">
          <div ref={column} data-testid="conversation-column" className="mx-auto max-w-reading space-y-9 text-body">
            {custom ? custom.node : turns.map((turn, index) => {
              if (turn.kind === "user") return <UserMessage key={turn.id} turn={turn} />;
              // 产物属于产出它的那次尝试的最后一段；没有尝试归属的产物放在最后一条回复下面。
              const own = files.filter(
                (file) => (file.attemptId !== "" && file.attemptId === turn.attemptId && index === lastIndexOfAttempt[turn.attemptId]) || (file.attemptId === "" && index === lastAgentIndex),
              );
              return <AgentMessage key={turn.id} turn={turn} expertName={expertName} files={own} totalFiles={totalFiles} onOpenFile={onOpenFile} onOpenAllFiles={onOpenAllFiles} speaker={roles[turn.nodeId]} nameOf={nameOf} last={index === lastAgentIndex} />;
            })}
            {children}
          </div>
        </div>
        {atBottom ? null : <ScrollToBottomButton running={running} onClick={scrollToBottom} />}
      </div>
      <TurnRail scroller={scroller} column={column} />
    </div>
  );
}
