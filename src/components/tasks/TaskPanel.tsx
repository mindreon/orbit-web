import { ArrowLeft, Bug, ChevronRight, Diff, FolderOpen, Globe, LayoutList, PanelRightClose, Terminal, X, type LucideIcon } from "lucide-react";
import { fileKey, visibleArtifacts, type ArtifactFile } from "../../lib/artifacts";
import type { ChatItem, ChatTeam } from "../../lib/chat";
import { cn } from "../../lib/cn";
import { useDeveloperMode } from "../../lib/devMode";
import type { NodeRole } from "../../lib/display";
import type { AttemptView, BudgetAmounts, NodeState, ProfileSwitch, TeamStageView } from "../../lib/taskEvents";
import type { TeamView } from "../../lib/taskConfig";
import type { Plan, Task, TaskEvent } from "../../lib/tasks";
import { ArtifactPreview } from "../conversation/ArtifactPreview";
import { FileIcon } from "../conversation/ArtifactCards";
import { memberTitle } from "../conversation/TeamRoster";
import { Avatar } from "../TeamAvatars";
import { mentionColor } from "../../lib/chat";
import { AttemptTimeline } from "./AttemptTimeline";
import { DeveloperInfo } from "./DeveloperInfo";
import { EventLog } from "./EventLog";
import { FileList, FileRows } from "./FileList";
import { MemberThread } from "./MemberThread";
import type { NodeActions } from "./NodeActions";
import { PlanGraph } from "./PlanGraph";
import { UsagePanel } from "./UsagePanel";

export const OVERVIEW = "overview";

/** 概览标签里现在看的是哪一页：首页、全部产物、某位成员的任务，或（开发者模式下）调试信息。 */
export type Overview = { readonly kind: "home" } | { readonly kind: "artifacts" } | { readonly kind: "member"; readonly role: string } | { readonly kind: "developer" };
export const HOME: Overview = { kind: "home" };

interface TaskPanelProps {
  readonly plan: Plan | null;
  readonly attempts: readonly AttemptView[];
  readonly nodes: Readonly<Record<string, NodeState>>;
  readonly task: Task;
  /** 正在运行的执行占着的预算。 */
  readonly reserved: BudgetAmounts;
  readonly pendingSwitches: Readonly<Record<string, ProfileSwitch>>;
  readonly nodeActions: NodeActions;
  readonly events: readonly TaskEvent[];
  readonly files: readonly ArtifactFile[];
  /** 已打开的预览标签，概览标签始终在最前。 */
  readonly openFiles: readonly ArtifactFile[];
  readonly active: string;
  readonly overview: Overview;
  /** 完整的群聊（成员的任务从这里取）；单智能体任务没有。 */
  readonly chat: readonly ChatItem[] | null;
  readonly onOverview: (overview: Overview) => void;
  /** 专家引用（id@版本）到显示名。 */
  readonly nameOf: (ref: string) => string;
  /** 每个节点是谁的（领队、成员、复盘），任务选了专家团时才有成员。 */
  readonly roles: Readonly<Record<string, NodeRole>>;
  readonly team: TeamView | null;
  readonly stageOf: (nodeId: string) => TeamStageView | undefined;
  readonly onActivate: (key: string) => void;
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onCloseFile: (key: string) => void;
  readonly onCollapse: () => void;
}

const TAB = "flex h-8 max-w-[10rem] items-center gap-1.5 rounded-control px-2.5 text-body";
const TAB_ON = "bg-card font-medium text-foreground shadow-sm";
const TAB_OFF = "text-gray-600 hover:bg-gray-200";

/** 还没有后端的入口：摆出来，灰着，标「即将」。 */
const COMING: ReadonlyArray<{ label: string; Icon: LucideIcon }> = [
  { label: "查看工作空间", Icon: FolderOpen },
  { label: "查看变更", Icon: Diff },
  { label: "打开终端", Icon: Terminal },
  { label: "打开浏览器", Icon: Globe },
];

function SubHeader({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" aria-label="返回" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={onBack}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-body font-medium text-foreground">{children}</div>
    </div>
  );
}

/**
 * 右侧详情面板：像浏览器标签页，第一个是概览，点产物会多开一个预览标签。概览里按点击的路径换页：首页（入口和产物）、
 * 某位成员的任务、全部产物，开发者模式下还有调试信息。
 * 宽屏时是并排的一列，灰底托着白卡片，不画边框；窄屏（<1024px）时是从右边滑出的抽屉，由页头的按钮打开。
 */
export function TaskPanel({ plan, nodes, task, reserved, pendingSwitches, nodeActions, attempts, events, files, openFiles, active, overview, chat, onOverview, nameOf, roles, team, stageOf, onActivate, onOpenFile, onCloseFile, onCollapse }: TaskPanelProps) {
  const developer = useDeveloperMode();
  const activeFile = openFiles.find((file) => fileKey(file) === active);
  const shown = visibleArtifacts(files);
  const page = overview.kind === "developer" && !developer ? HOME : overview;
  const back = () => onOverview(HOME);
  const chatTeam: ChatTeam | null = team;
  const member = page.kind === "member" ? team?.members.find((item) => item.role === page.role) : undefined;
  return (
    <aside
      aria-label="任务详情"
      className="flex min-h-0 w-[26rem] shrink-0 flex-col bg-muted max-xl:w-[22rem] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(26rem,100vw)] max-lg:shadow-xl"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 px-2">
        <button type="button" aria-label="概览" aria-pressed={active === OVERVIEW} className={cn(TAB, "px-2", active === OVERVIEW ? TAB_ON : TAB_OFF)} onClick={() => onActivate(OVERVIEW)}>
          <LayoutList aria-hidden="true" className="h-4 w-4" />
          概览
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {openFiles.map((file) => {
            const key = fileKey(file);
            return (
              <span key={key} className={cn(TAB, "shrink-0", active === key ? TAB_ON : TAB_OFF)}>
                <button type="button" className="flex min-w-0 items-center gap-1.5" onClick={() => onActivate(key)}>
                  <FileIcon file={file} size="sm" />
                  <span className="truncate">{file.name}</span>
                </button>
                <button type="button" aria-label={`关闭 ${file.name}`} className="rounded-control p-0.5 hover:bg-gray-100" onClick={() => onCloseFile(key)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
        <button type="button" aria-label="收起详情" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200" onClick={onCollapse}>
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      {activeFile ? (
        <ArtifactPreview key={fileKey(activeFile)} file={activeFile} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {page.kind === "home" ? (
            <div data-testid="panel-home">
              <ul className="space-y-0.5 rounded-card bg-card p-1">
                {COMING.map(({ label, Icon }) => (
                  <li key={label}>
                    <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-control px-2 py-2 text-left text-body text-muted-foreground">
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{label}</span>
                      <span className="rounded-control bg-secondary px-1.5 text-caption">即将</span>
                    </button>
                  </li>
                ))}
                {developer ? (
                  <li>
                    <button type="button" className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-body text-foreground hover:bg-gray-100" onClick={() => onOverview({ kind: "developer" })}>
                      <Bug aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="flex-1">开发者视图</span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                ) : null}
              </ul>
              <details open aria-label="产物" className="group mt-6">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-small font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  产物 ({shown.length})
                </summary>
                {shown.length === 0 ? <p className="mt-2 text-small text-muted-foreground">暂无产物</p> : <FileRows files={shown} onOpen={onOpenFile} />}
              </details>
            </div>
          ) : null}
          {page.kind === "artifacts" ? (
            <div data-testid="panel-artifacts">
              <SubHeader onBack={back}>全部产物</SubHeader>
              <FileList files={shown} onOpen={onOpenFile} />
            </div>
          ) : null}
          {page.kind === "member" && chat && chatTeam ? (
            <div data-testid="panel-member" data-role={page.role}>
              <SubHeader onBack={back}>
                {(() => {
                  const { name, label } = memberTitle({ role: page.role, label: member?.label ?? "", name: member?.name ?? "" });
                  return (
                    <>
                      <Avatar name={name} tone={mentionColor(page.role, chatTeam)} size="md" />
                      <span className="min-w-0 truncate">
                        {name}
                        {label ? <span className="ml-1.5 font-normal text-muted-foreground">{label}</span> : null}
                        <span className="font-normal"> 的任务</span>
                      </span>
                    </>
                  );
                })()}
              </SubHeader>
              <MemberThread items={chat} role={page.role} team={chatTeam} files={files} onOpenFile={onOpenFile} onOpenAllFiles={() => onOverview({ kind: "artifacts" })} totalFiles={shown.length} />
            </div>
          ) : null}
          {page.kind === "developer" ? (
            <div data-testid="panel-developer">
              <SubHeader onBack={back}>开发者视图</SubHeader>
              <UsagePanel usage={task.usage} budgets={task.budgets} reserved={reserved} />
              <PlanGraph plan={plan} nodes={nodes} pendingSwitches={pendingSwitches} actions={nodeActions} nameOf={nameOf} roles={roles} team={team} stageOf={stageOf} />
              <AttemptTimeline attempts={attempts} nameOf={nameOf} />
              <div className="mt-6 space-y-2">
                <details className="rounded-card bg-card">
                  <summary className="cursor-pointer px-3 py-2 text-small font-medium text-gray-700">事件日志（{events.filter((event) => event.seq > 0).length}）</summary>
                  <EventLog events={events} />
                </details>
                <DeveloperInfo task={task} plan={plan} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
