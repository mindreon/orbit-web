import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { bubbleFiles, fileOwners, memberThread, mentionColor, type ChatItem, type ChatTeam, type ThreadSection } from "../../lib/chat";
import type { ArtifactFile } from "../../lib/artifacts";
import { useDeveloperMode } from "../../lib/devMode";
import { roleName } from "../../lib/display";
import { formatSeconds } from "../../lib/usage";
import { ArtifactCards } from "../conversation/ArtifactCards";
import { ActivityTimeline } from "../conversation/ActivityTimeline";
import { memberTitle } from "../conversation/TeamRoster";
import { RichText } from "../markdown/RichText";
import { Avatar } from "../TeamAvatars";

type Bubble = Extract<ChatItem, { type: "bubble" }>;

interface MemberThreadProps {
  readonly items: readonly ChatItem[];
  readonly role: string;
  readonly team: ChatTeam;
  readonly files: readonly ArtifactFile[];
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
  readonly totalFiles: number;
}

/** 领队下发的任务：一句提示，全文折在「下发任务详情」里（不截断，太长就在卡片里滚动）。 */
function Assignment({ assign, member, team }: { assign: Bubble; member: string; team: ChatTeam }) {
  const leader = team.members.find((item) => item.role === team.leader);
  const who = roleName(team.leader, leader?.label, team.leader);
  const leaderName = leader?.name || who;
  return (
    <div data-testid="thread-assignment" className="space-y-2">
      <p className="flex items-center gap-2 text-small font-medium text-gray-700">
        <Avatar name={leaderName} tone={mentionColor(team.leader, team)} />
        <span>{leaderName}</span>
        {leader?.name ? <span className="font-normal text-muted-foreground">{who}</span> : null}
      </p>
      <p className="text-body text-foreground">@{member}，你有一条待处理任务，请查收</p>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-small text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          下发任务详情
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:-rotate-90" />
        </summary>
        <div data-testid="thread-assignment-text" className="mt-2 max-h-80 overflow-y-auto rounded-card bg-muted px-3 py-2 text-body">
          <RichText text={assign.text} />
        </div>
      </details>
    </div>
  );
}

function Section({ section, team, files, owners, onOpenFile, onOpenAllFiles, totalFiles, developer, member }: { section: ThreadSection; member: string; developer: boolean; owners: ReadonlySet<string> } & Omit<MemberThreadProps, "items" | "role">) {
  return (
    <div data-testid="thread-section" className="space-y-3">
      {section.assign ? <Assignment assign={section.assign} member={member} team={team} /> : null}
      {section.seconds !== null ? <p className="text-small text-muted-foreground">已处理 {formatSeconds(section.seconds)}</p> : null}
      {section.bubbles.map((bubble) => {
        const text = bubble.text || bubble.work?.text || "";
        return (
          <div key={bubble.id} data-testid="thread-bubble" data-kind={bubble.kind} className="space-y-2">
            {bubble.work ? <ActivityTimeline segments={bubble.work.segments} active={bubble.live} /> : null}
            {developer && bubble.work?.thinking ? <p className="whitespace-pre-wrap rounded-card bg-muted px-3 py-2 text-small text-muted-foreground">{bubble.work.thinking}</p> : null}
            {text !== "" || bubble.live ? (
              <div className="rounded-card bg-secondary px-4 py-2.5 text-body text-foreground">
                {bubble.kind === "reply" ? <p data-testid="thread-reply-to" className="mb-1 text-small font-medium text-primary-700">{bubble.to.includes("user") ? "回复你" : "回复领队"}</p> : null}
                {text === "" ? <span className="text-muted-foreground">正在思考…</span> : <RichText text={text} streaming={bubble.live && !bubble.text} />}
                {bubble.status === "failed" ? <p className="mt-1 text-caption text-danger-700">失败{bubble.failure ? `：${bubble.failure}` : ""}</p> : null}
              </div>
            ) : null}
            <ArtifactCards files={bubbleFiles(bubble, files, owners)} total={totalFiles} onOpen={onOpenFile} onOpenAll={onOpenAllFiles} />
          </div>
        );
      })}
    </div>
  );
}

/** 右侧面板里一位成员的任务：领队派的活，成员的步骤、消息、给领队的回复和它的文件。数据都来自页面已有的对话，没有新接口。 */
export function MemberThread({ items, role, team, files, onOpenFile, onOpenAllFiles, totalFiles }: MemberThreadProps) {
  const developer = useDeveloperMode();
  const owners = useMemo(() => fileOwners(items), [items]);
  const sections = memberThread(items, role);
  const member = team.members.find((item) => item.role === role);
  const { name, label } = memberTitle({ role, label: member?.label ?? "", name: member?.name ?? "" });
  if (sections.length === 0) return <p className="text-small text-muted-foreground">还没有收到任务。</p>;
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <Section key={section.assign?.id ?? `s${index}`} section={section} member={name || label} team={team} files={files} owners={owners} onOpenFile={onOpenFile} onOpenAllFiles={onOpenAllFiles} totalFiles={totalFiles} developer={developer} />
      ))}
    </div>
  );
}
