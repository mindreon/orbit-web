import type { UserTurn } from "../../lib/conversation";

/** 你发的话：靠右的气泡。打断类的消息带一个小标记。 */
export function UserMessage({ turn }: { turn: UserTurn }) {
  return (
    <div data-testid="user-message" className="flex justify-end">
      <div className="max-w-[85%]">
        {turn.interrupt ? <p className="mb-1 text-right text-caption text-warning-700">已打断当前执行</p> : null}
        <div className="whitespace-pre-wrap break-words rounded-card rounded-tr-control bg-secondary px-4 py-2.5 text-body text-foreground">{turn.text}</div>
      </div>
    </div>
  );
}
