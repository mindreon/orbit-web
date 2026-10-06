import { Check, ChevronRight, Clock, Loader2, X } from "lucide-react";
import { useState } from "react";
import { mentionColor, type ChatTeam, type MemberStatus, type RosterMember } from "../../lib/chat";
import { cn } from "../../lib/cn";
import { Avatar } from "../TeamAvatars";

const STATUS: Record<MemberStatus, { Icon: typeof Check; className: string; text: string }> = {
  running: { Icon: Loader2, className: "animate-spin text-primary-700", text: "进行中" },
  done: { Icon: Check, className: "text-success-700", text: "已完成" },
  failed: { Icon: X, className: "text-danger-700", text: "失败" },
  waiting: { Icon: Clock, className: "text-muted-foreground", text: "等待中" },
};

/** 一位成员显示成「名字 + 淡色的角色名」；没有名字时只写角色名。 */
export function memberTitle(member: Pick<RosterMember, "role" | "label" | "name">): { name: string; label: string } {
  const label = member.label || member.role;
  return member.name ? { name: member.name, label } : { name: label, label: "" };
}

/** 领队这一轮派出去的成员：折起来是一排头像和人数，展开后每位成员一行，点一行在右侧看这位成员的任务。 */
export function TeamRoster({ members, team, onOpenMember }: { members: readonly RosterMember[]; team: ChatTeam; onOpenMember: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  if (members.length === 0) return null;
  return (
    <div data-testid="team-roster" className="rounded-card bg-muted text-body">
      <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {members.slice(0, 4).map((member, index) => (
            <Avatar key={member.role} name={memberTitle(member).name} tone={mentionColor(member.role, team)} className={cn("ring-2 ring-muted", index > 0 && "-ml-1.5")} />
          ))}
        </span>
        <span className="flex-1">{members.length} 位团队成员</span>
        <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <ul className="px-1 pb-1">
          {members.map((member) => {
            const { name, label } = memberTitle(member);
            const { Icon, className, text } = STATUS[member.status];
            return (
              <li key={member.role}>
                <button type="button" data-testid="roster-member" data-role={member.role} data-status={member.status} aria-label={`查看 ${name} 的任务`} className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-gray-200" onClick={() => onOpenMember(member.role)}>
                  <Avatar name={name} tone={mentionColor(member.role, team)} size="md" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-foreground">{name}</span>
                    {label ? <span className="ml-2 text-small text-muted-foreground">{label}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-small text-muted-foreground">
                    <Icon aria-hidden="true" className={cn("h-3.5 w-3.5", className)} />
                    {text}
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
