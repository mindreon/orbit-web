import { cn } from "../lib/cn";
import { roleName } from "../lib/display";
import { avatarStack } from "../lib/team";

// One tinted 100 surface with its 700 text per tone (at least 4.5:1 in both themes, see src/lib/contrast.test.ts).
export const TONES = ["bg-primary-100 text-primary-700", "bg-success-100 text-success-700", "bg-warning-100 text-warning-700", "bg-accent text-accent-foreground", "bg-gray-100 text-gray-700"] as const;

const SIZES = {
  sm: "h-5 w-5 text-caption",
  md: "h-7 w-7 text-caption",
} as const;

/** A person-sized dot with the first character of a name: how a member (or an expert) is shown without a picture. */
export function Avatar({ name, tone = 0, size = "sm", className }: { name: string; tone?: number; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden="true" data-testid="avatar" className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", SIZES[size], TONES[tone % TONES.length], className)}>
      {name.trim().slice(0, 1) || "专"}
    </span>
  );
}

type Member = { readonly role: string; readonly name: string; readonly label?: string };

/**
 * The members of a team as overlapping avatars, the first few and a count for the rest. The stack is one element with the
 * members in its label, so a reader of the page hears 「成员：研究员 · 调研专家、…」 once, not an avatar at a time.
 */
export function AvatarStack({ members, leader = "", max = 4, size = "sm", className }: { members: readonly Member[]; /** 领队的角色名：它的成员标成「领队」。 */ leader?: string; max?: number; size?: keyof typeof SIZES; className?: string }) {
  const { shown, more } = avatarStack(members, max);
  return (
    <span role="img" data-testid="avatar-stack" aria-label={`成员：${members.map((member) => `${roleName(member.role, member.label, leader)} · ${member.name}`).join("、")}`} className={cn("flex shrink-0 items-center", className)}>
      {shown.map((member, index) => (
        <Avatar key={`${member.role}:${index}`} name={member.name} tone={index} size={size} className={cn("ring-2 ring-card", index > 0 && "-ml-1.5")} />
      ))}
      {more > 0 ? <span aria-hidden="true" className={cn("-ml-1.5 flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-medium text-gray-700 ring-2 ring-card", SIZES[size])}>+{more}</span> : null}
    </span>
  );
}
