import { ChevronRight, ClipboardCheck } from "lucide-react";
import type { ArtifactFile } from "../../lib/artifacts";
import { latestByName } from "../../lib/artifacts";
import { groupChat, mentionColor, parseMentions, type ChatGroup, type ChatItem, type ChatTeam } from "../../lib/chat";
import { reviewLabel, roleName } from "../../lib/display";
import { cn } from "../../lib/cn";
import { StatusBadge } from "../../ui/StatusBadge";
import { RichText } from "../markdown/RichText";
import { Avatar } from "../TeamAvatars";
import { ApprovalInbox } from "../tasks/ApprovalInbox";
import type { ApprovalInfo } from "../../lib/approvals";
import { ArtifactCards } from "./ArtifactCards";
import { MentionChip, MentionText } from "./MentionChip";
import { StepList } from "./StepList";

type Bubble = Extract<ChatItem, { type: "bubble" }>;

interface GroupChatProps {
  readonly items: readonly ChatItem[];
  readonly team: ChatTeam;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  readonly pendingApprovals: readonly string[];
  readonly cancelledApprovals: readonly string[];
  readonly approvalInfos: Readonly<Record<string, ApprovalInfo>>;
  readonly nodeTitles: Readonly<Record<string, string>>;
  readonly nameOf: (ref: string) => string;
  readonly roleNameOf: (role: string) => string;
  readonly onDecide: (approvalId: string, decision: "approve" | "reject", always: boolean) => void;
}

/** The files a bubble owns: the ones its message names, and (an answer or a review) what its attempt left. */
function filesOf(bubble: Bubble, files: readonly ArtifactFile[]): readonly ArtifactFile[] {
  const latest = latestByName(files);
  const named = bubble.artifacts.flatMap((name) => latest.filter((file) => file.name === name));
  const ofAttempt = (bubble.kind === "reply" || bubble.kind === "review" || bubble.kind === "turn") && bubble.attemptId !== "" ? files.filter((file) => file.attemptId === bubble.attemptId) : [];
  const seen = new Set<string>();
  return [...named, ...ofAttempt].filter((file) => (seen.has(`${file.manifestId}/${file.name}`) ? false : (seen.add(`${file.manifestId}/${file.name}`), true)));
}

function Thinking({ text }: { text: string }) {
  return (
    <details data-testid="thinking" className="group rounded-card bg-muted text-body">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
        思考过程
      </summary>
      <p className="whitespace-pre-wrap px-3 pb-3 pt-1 text-small text-muted-foreground">{text}</p>
    </details>
  );
}

function BubbleBody({ bubble, team, files, onOpenFile, onOpenAllFiles }: { bubble: Bubble; team: ChatTeam } & Pick<GroupChatProps, "files" | "onOpenFile" | "onOpenAllFiles">) {
  const own = filesOf(bubble, files);
  const text = bubble.text || bubble.work?.text || "";
  const mentions = parseMentions(text, team.members);
  // A reply says who it answers; an assignment, who it is for. The chips lead the text.
  const to = bubble.to.filter((role) => role !== "system" && !mentions.includes(role));
  return (
    <div data-testid="chat-bubble" data-kind={bubble.kind} data-live={bubble.live ? "true" : undefined} data-status={bubble.status} data-node-id={bubble.nodeId || undefined} className="space-y-2">
      {bubble.work && (bubble.work.steps.length > 0 || bubble.work.thinking) ? (
        <div className="space-y-2" data-testid="chat-work">
          <StepList steps={bubble.work.steps} active={bubble.live} />
          {bubble.work.thinking ? <Thinking text={bubble.work.thinking} /> : null}
        </div>
      ) : null}
      {text !== "" || bubble.live ? (
        <div className={cn("rounded-card rounded-tl-control px-4 py-2.5 text-body text-foreground", bubble.kind === "note" ? "bg-card ring-1 ring-border" : "bg-secondary")}>
          {bubble.kind === "review" && bubble.reviewRound ? (
            <p data-testid="chat-review" className="mb-1 flex items-center gap-1.5 text-small font-medium text-primary-700">
              <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
              {reviewLabel(bubble.reviewRound)}
            </p>
          ) : null}
          {to.length > 0 ? (
            <span data-testid="chat-to" className="mr-1">
              {to.map((role) => (role === "user" ? <span key={role} className="mx-0.5 inline-flex rounded-control bg-primary-100 px-1.5 text-small font-medium text-primary-700">@你</span> : <MentionChip key={role} role={role} team={team} />))}
            </span>
          ) : null}
          {text === "" ? (
            <span className="text-muted-foreground">{bubble.live ? "正在思考…" : ""}</span>
          ) : mentions.length > 0 ? (
            <span className="whitespace-pre-wrap break-words">
              <MentionText text={text} team={team} />
            </span>
          ) : (
            <RichText text={text} streaming={bubble.live && !bubble.text} />
          )}
          {bubble.status === "failed" ? (
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone="danger">失败</StatusBadge>
              {bubble.failure ? <span className="text-caption text-muted-foreground">{bubble.failure}</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}
      <ArtifactCards files={own} onOpen={onOpenFile} onOpenAll={onOpenAllFiles} />
    </div>
  );
}

function BubbleGroup({ group, team, nameOf, ...rest }: { group: Extract<ChatGroup, { type: "bubbles" }>; team: ChatTeam; nameOf: (ref: string) => string } & Pick<GroupChatProps, "files" | "onOpenFile" | "onOpenAllFiles">) {
  const { speaker } = group;
  const who = roleName(speaker.role, speaker.label, team.leader);
  const tone = mentionColor(speaker.role, team);
  return (
    <div data-testid="chat-group" data-role={speaker.role} className="flex items-end gap-2">
      {/* The avatar sits at the bottom of the group, beside the last bubble, as in a group chat. */}
      <Avatar name={speaker.name || who} tone={tone} size="md" className="mb-0.5" />
      <div className="min-w-0 max-w-[85%] flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-small font-medium text-gray-700">
          <span data-testid="chat-speaker">{speaker.name ? `${who} · ${speaker.name}` : who}</span>
          {speaker.leader ? <span data-testid="chat-leader-tag" className="rounded-control bg-primary-100 px-1.5 text-caption font-medium text-primary-700">领队</span> : null}
        </p>
        {group.items.map((bubble) => (
          <BubbleBody key={bubble.id} bubble={bubble} team={team} {...rest} />
        ))}
      </div>
    </div>
  );
}

/** 有专家团的任务的主对话：像群聊。一位发言者的连续气泡共用一个名字，头像在这一组的左下角。 */
export function GroupChat({ items, team, nameOf, pendingApprovals, cancelledApprovals, approvalInfos, nodeTitles, roleNameOf, onDecide, ...rest }: GroupChatProps) {
  return (
    <>
      {groupChat(items).map((group) => {
        if (group.type === "bubbles") return <BubbleGroup key={group.key} group={group} team={team} nameOf={nameOf} {...rest} />;
        if (group.type === "user") {
          return (
            <div key={group.key} className="space-y-2">
              {group.items.map((item) => (
                <div key={item.id} data-testid="user-message" data-mentions={item.mentions.join(",") || undefined} className="flex justify-end">
                  <div className="max-w-[85%]">
                    {item.interrupt ? <p className="mb-1 text-right text-caption text-warning-700">已打断当前执行</p> : null}
                    <div className="whitespace-pre-wrap break-words rounded-card rounded-tr-control bg-primary-100 px-4 py-2.5 text-body text-foreground">
                      {item.mentions.filter((role) => !parseMentions(item.text, team.members).includes(role)).map((role) => (
                        <MentionChip key={role} role={role} team={team} />
                      ))}
                      <MentionText text={item.text} team={team} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (group.type === "system") {
          return (
            <div key={group.key} className="space-y-2">
              {group.items.map((item) => (
                <p key={item.id} data-testid="chat-system" className="mx-auto w-fit max-w-full rounded-full bg-muted px-3 py-1 text-center text-caption text-muted-foreground">
                  {item.text}
                </p>
              ))}
            </div>
          );
        }
        // An approval asked in the middle of the chat stays where it was asked, with the member's name on it.
        const shown = group.items.map((item) => item.approvalId).filter((id) => pendingApprovals.includes(id) || cancelledApprovals.includes(id));
        if (shown.length === 0) return null;
        return (
          <ApprovalInbox
            key={group.key}
            approvals={shown.filter((id) => pendingApprovals.includes(id))}
            cancelled={shown.filter((id) => cancelledApprovals.includes(id))}
            infos={approvalInfos}
            nodeTitles={nodeTitles}
            nameOf={nameOf}
            roleNameOf={roleNameOf}
            onDecide={onDecide}
          />
        );
      })}
    </>
  );
}
