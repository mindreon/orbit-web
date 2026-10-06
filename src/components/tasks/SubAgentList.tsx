import { ArrowLeft } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import { mentionColor, type ChatItem, type ChatTeam } from "../../lib/chat";
import { isActive, subAgents, type SubAgent } from "../../lib/subAgents";
import type { TeamView } from "../../lib/taskConfig";
import { relativeTime } from "../../lib/time";
import { useNow } from "../../lib/useNow";
import { memberTitle } from "../conversation/TeamRoster";
import { Avatar } from "../TeamAvatars";
import { MemberThread } from "./MemberThread";

interface SubAgentsViewProps {
  readonly chat: readonly ChatItem[];
  readonly team: TeamView;
  readonly files: readonly ArtifactFile[];
  readonly totalFiles: number;
  /** 正在看哪位成员的任务；null 是列表。 */
  readonly role: string | null;
  readonly onRole: (role: string | null) => void;
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onOpenAllFiles: () => void;
}

/** 名字下面的淡色一行：角色名，有简介再跟上简介。 */
function subtitle(agent: SubAgent): string {
  const { label } = memberTitle(agent);
  return [label, agent.description].filter(Boolean).join(" · ");
}

function Row({ agent, team, now, onOpen }: { agent: SubAgent; team: ChatTeam; now: number; onOpen: () => void }) {
  const { name } = memberTitle(agent);
  const second = subtitle(agent);
  return (
    <li>
      <button type="button" data-testid="subagent-row" data-role={agent.role} data-status={agent.status} className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-gray-100" onClick={onOpen}>
        <Avatar name={name} tone={mentionColor(agent.role, team)} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-foreground">{name}</span>
          {second ? <span className="block truncate text-small text-muted-foreground">{second}</span> : null}
        </span>
        {agent.at ? <span className="shrink-0 text-caption text-muted-foreground">{relativeTime(agent.at, now)}</span> : null}
      </button>
    </li>
  );
}

function Group({ id, title, agents, empty, team, now, onOpen }: { id: string; title: string; agents: readonly SubAgent[]; empty: string; team: ChatTeam; now: number; onOpen: (role: string) => void }) {
  return (
    <section data-testid="subagent-group" data-group={id} aria-label={title}>
      <h3 className="px-2 text-small font-medium text-muted-foreground">
        {title} · {agents.length}
      </h3>
      {agents.length === 0 ? (
        <p className="px-2 pt-2 text-small text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {agents.map((agent) => (
            <Row key={agent.role} agent={agent} team={team} now={now} onOpen={() => onOpen(agent.role)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 右侧「子智能体」标签：团队成员按进行中和已结束分两组，点一位在这里看它的任务（返回时列表停在原来的位置）。
 * 成员的状态与对话里的名册同源，任务内容就是 `MemberThread`，没有新接口。
 */
export function SubAgentsView({ chat, team, files, totalFiles, role, onRole, onOpenFile, onOpenAllFiles }: SubAgentsViewProps) {
  const now = useNow();
  const agents = useMemo(() => subAgents(chat, team), [chat, team]);
  const scroller = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  // 点开的成员一定在团队里，但还没有任何发言（不在名册里）时也能看，只是没有状态。
  const member = team.members.find((item) => item.role === role);
  const detail: SubAgent | undefined = agents.find((agent) => agent.role === role) ?? (member ? { role: member.role, label: member.label ?? "", name: member.name ?? "", description: member.description ?? "", status: "waiting", at: "" } : undefined);
  const shown = detail?.role ?? null;

  // 进详情从头看，返回列表回到原来滚到的位置。
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = shown === null ? listScroll.current : 0;
  }, [shown]);

  const open = (next: string) => {
    listScroll.current = scroller.current?.scrollTop ?? 0;
    onRole(next);
  };

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2" data-testid="panel-agents">
      {detail ? (
        <div data-testid="panel-member" data-role={detail.role}>
          <div className="mb-4 flex items-center gap-2">
            <button type="button" aria-label="返回" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={() => onRole(null)}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <Avatar name={memberTitle(detail).name} tone={mentionColor(detail.role, team)} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-foreground">{memberTitle(detail).name}</p>
              {subtitle(detail) ? <p className="truncate text-small text-muted-foreground">{subtitle(detail)}</p> : null}
            </div>
          </div>
          <MemberThread items={chat} role={detail.role} team={team} files={files} onOpenFile={onOpenFile} onOpenAllFiles={onOpenAllFiles} totalFiles={totalFiles} />
        </div>
      ) : (
        <div data-testid="subagent-list" className="space-y-6">
          <Group id="active" title="进行中" agents={agents.filter((agent) => isActive(agent.status))} empty="尚无进行中的子智能体。" team={team} now={now} onOpen={open} />
          <Group id="ended" title="已结束" agents={agents.filter((agent) => !isActive(agent.status))} empty="尚无已结束的子智能体。" team={team} now={now} onOpen={open} />
        </div>
      )}
    </div>
  );
}
