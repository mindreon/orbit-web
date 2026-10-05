import { TONES } from "../TeamAvatars";
import { cn } from "../../lib/cn";
import { mentionColor, splitMentions, type ChatTeam } from "../../lib/chat";
import { roleName } from "../../lib/display";

/** An @ of a member: a small coloured chip, the colour fixed by the member's place in the team. */
export function MentionChip({ role, team, text, className }: { role: string; team: ChatTeam; /** What to write; the member's label by default. */ text?: string; className?: string }) {
  const member = team.members.find((item) => item.role === role);
  return (
    <span data-testid="mention-chip" data-role={role} className={cn("mx-0.5 inline-flex items-baseline rounded-control px-1.5 text-small font-medium", TONES[mentionColor(role, team) % TONES.length], className)}>
      {text ?? `@${roleName(role, member?.label, team.leader)}`}
    </span>
  );
}

/** Text with the @mentions of members drawn as chips; the rest as it was written. */
export function MentionText({ text, team }: { text: string; team: ChatTeam }) {
  return (
    <>
      {splitMentions(text, team.members).map((part, index) => (part.role ? <MentionChip key={index} role={part.role} team={team} text={part.text} /> : <span key={index}>{part.text}</span>))}
    </>
  );
}
