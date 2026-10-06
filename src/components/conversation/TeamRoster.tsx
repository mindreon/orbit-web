import { X } from "lucide-react";
import { mentionColor, type ChatTeam, type MemberStatus, type RosterMember } from "../../lib/chat";
import { Avatar } from "../TeamAvatars";

/** 一位成员显示成「名字 + 淡色的角色名」；没有名字时只写角色名。 */
export function memberTitle(member: Pick<RosterMember, "role" | "label" | "name">): { name: string; label: string } {
  const label = member.label || member.role;
  return member.name ? { name: member.name, label } : { name: label, label: "" };
}

/** 最多摆几个成员，其余收成「另有 N 个」。 */
const MAX_CHIPS = 3;

/** 一排成员合起来是什么状态：有人在做就是已开始，没人在做时有失败的先说失败，全做完才说已完成。 */
function summary(members: readonly RosterMember[]): { text: string; failed: boolean } {
  const count = (status: MemberStatus) => members.filter((member) => member.status === status).length;
  const running = count("running");
  const failed = count("failed");
  const done = count("done");
  if (running > 0) return { text: "已开始工作", failed: false };
  if (failed > 0) return { text: `${failed} 个失败`, failed: true };
  if (done === members.length) return { text: "已完成", failed: false };
  return { text: done > 0 ? "已开始工作" : "等待中", failed: false };
}

/**
 * 领队这一轮派出去的成员，在对话里只占一行：最多三个成员小标签，超出的写「另有 N 个」，最后一句话说整体进展。
 * 点一个成员，在右侧「子智能体」里看这位成员的任务。
 */
export function TeamRoster({ members, team, onOpenMember }: { members: readonly RosterMember[]; team: ChatTeam; onOpenMember: (role: string) => void }) {
  if (members.length === 0) return null;
  const { text, failed } = summary(members);
  const more = members.length - MAX_CHIPS;
  return (
    <div data-testid="team-roster" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-muted-foreground">
      {members.slice(0, MAX_CHIPS).map((member) => {
        const { name } = memberTitle(member);
        return (
          <button
            key={member.role}
            type="button"
            data-testid="roster-member"
            data-role={member.role}
            data-status={member.status}
            aria-label={`查看 ${name} 的任务`}
            className="flex h-7 min-w-0 max-w-[13rem] items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2.5 text-small text-foreground hover:border-gray-400"
            onClick={() => onOpenMember(member.role)}
          >
            <Avatar name={name} tone={mentionColor(member.role, team)} />
            <span className="min-w-0 truncate">{name}</span>
            {member.status === "failed" ? <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-danger-700" /> : null}
          </button>
        );
      })}
      {more > 0 ? <span data-testid="roster-more">另有 {more} 个</span> : null}
      <span data-testid="roster-status" aria-live="polite" className={failed ? "text-danger-700" : undefined}>
        {text}
      </span>
    </div>
  );
}
