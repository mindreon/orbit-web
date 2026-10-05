import { useEffect, useRef } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { Turn } from "../../lib/conversation";
import type { NodeRole } from "../../lib/display";
import { AgentMessage } from "./AgentMessage";
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
  /** 有专家团的任务：整段对话由它画（群聊），`size` 是它的内容多长，用来决定要不要跟到底部。 */
  readonly custom?: { readonly node: React.ReactNode; readonly size: number };
  /** 放在对话最下面的内联卡片：审批、Agent 提问。 */
  readonly children?: React.ReactNode;
}

const NEAR_BOTTOM_PX = 120;

/** 对话滚动区。新内容到达时，如果你本来就在底部附近就跟到底部；你往上翻看历史时不打扰。 */
export function Conversation({ turns, expertName, files, onOpenFile, onOpenAllFiles, roles = {}, nameOf, custom, children }: ConversationProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastAgentIndex = turns.reduce((last, turn, index) => (turn.kind === "agent" ? index : last), -1);
  // 尝试的产物只挂在它的最后一段回复下：同一次尝试被切成多段时，卡片不重复。
  const lastIndexOfAttempt: Record<string, number> = {};
  turns.forEach((turn, index) => {
    if (turn.kind === "agent") lastIndexOfAttempt[turn.attemptId] = index;
  });
  const size = custom?.size ?? turns.reduce((sum, turn) => sum + (turn.kind === "agent" ? turn.text.length + turn.steps.length : turn.text.length), 0);

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
      {/* 一行大约 40 个汉字：用户气泡、回复、产物卡片都在这一列里，眼睛不用来回找 */}
      <div className="px-4 py-6 sm:px-6">
        <div data-testid="conversation-column" className="mx-auto max-w-reading space-y-6 text-body">
          {custom ? custom.node : turns.map((turn, index) => {
            if (turn.kind === "user") return <UserMessage key={turn.id} turn={turn} />;
            // 产物属于产出它的那次尝试的最后一段；没有尝试归属的产物放在最后一条回复下面。
            const own = files.filter(
              (file) => (file.attemptId !== "" && file.attemptId === turn.attemptId && index === lastIndexOfAttempt[turn.attemptId]) || (file.attemptId === "" && index === lastAgentIndex),
            );
            return <AgentMessage key={turn.id} turn={turn} expertName={expertName} files={own} onOpenFile={onOpenFile} onOpenAllFiles={onOpenAllFiles} speaker={roles[turn.nodeId]} nameOf={nameOf} />;
          })}
          {children}
        </div>
      </div>
    </div>
  );
}
