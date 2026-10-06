import { replyTime } from "../../lib/activity";
import type { UserTurn } from "../../lib/conversation";
import { ActionRow, CopyButton } from "./ReplyActions";

/** A message of yours: a bubble on the right, with copy and the time under it when the pointer is on it. */
export function UserBubble({ text, at, interrupt, mentions, children }: { text: string; at?: string; interrupt: boolean; mentions?: string; children?: React.ReactNode }) {
  return (
    <div data-testid="user-message" data-mentions={mentions} className="group/msg relative flex flex-col items-end">
      <div className="max-w-[78%]">
        {interrupt ? <p className="mb-1 text-right text-caption text-warning-700">已打断当前执行</p> : null}
        <div data-testid="user-text" className="whitespace-pre-wrap break-words rounded-bubble bg-secondary px-4 py-2 text-body text-foreground">{children ?? text}</div>
      </div>
      <ActionRow testId="user-actions" align="end">
        <CopyButton text={text} label="复制消息" />
        {at ? <span className="tabular-nums">{replyTime(at)}</span> : null}
      </ActionRow>
    </div>
  );
}

/** 你发的话：靠右的气泡。打断类的消息带一个小标记。 */
export function UserMessage({ turn }: { turn: UserTurn }) {
  return <UserBubble text={turn.text} at={turn.at} interrupt={turn.interrupt} />;
}
