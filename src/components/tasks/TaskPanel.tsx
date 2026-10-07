import { ArrowLeft, Bot, Bug, ChevronRight, Code2, Diff, File, FileImage, FileText, FolderOpen, Globe, LayoutList, Maximize2, Minimize2, PanelRightClose, Terminal, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fileKey, fileKind, visibleArtifacts, type ArtifactFile, type FileKind } from "../../lib/artifacts";
import type { ChatItem } from "../../lib/chat";
import { cn } from "../../lib/cn";
import { useDeveloperMode } from "../../lib/devMode";
import type { NodeRole } from "../../lib/display";
import type { AttemptView, BudgetAmounts, NodeState, ProfileSwitch, TeamStageView } from "../../lib/taskEvents";
import type { TeamView } from "../../lib/taskConfig";
import type { ArtifactOmitted, Plan, Task, TaskEvent } from "../../lib/tasks";
import { clampPanelWidth, defaultPanelWidth, readPanelWidth, writePanelWidth } from "../../lib/panelWidth";
import { BREAKPOINT, useMediaQuery } from "../../lib/useMediaQuery";
import { ArtifactFilePreview } from "../files/ArtifactFilePreview";
import { AttemptTimeline } from "./AttemptTimeline";
import { DeveloperInfo } from "./DeveloperInfo";
import { EventLog } from "./EventLog";
import { ArtifactTree, FileList, OmittedNotice } from "./FileList";
import type { NodeActions } from "./NodeActions";
import { PANEL_WIDTH_VAR, PanelResizeHandle } from "./PanelResizeHandle";
import { PlanGraph } from "./PlanGraph";
import { SubAgentsView } from "./SubAgentList";
import { UsagePanel } from "./UsagePanel";

export const OVERVIEW = "overview";
/** 团队任务固定多一个「子智能体」标签；文件标签的 key 是 `清单/文件名`，不会撞上这两个。 */
export const AGENTS = "agents";

/** 概览标签里现在看的是哪一页：首页、全部产物，或（开发者模式下）调试信息。 */
export type Overview = { readonly kind: "home" } | { readonly kind: "artifacts" } | { readonly kind: "developer" };
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
  /** 清单里没列出来的文件（合计）；没有就是 null。 */
  readonly omitted: ArtifactOmitted | null;
  /** 已打开的预览标签，概览标签始终在最前。 */
  readonly openFiles: readonly ArtifactFile[];
  readonly active: string;
  readonly overview: Overview;
  /** 完整的群聊（成员的任务从这里取）；单智能体任务没有。 */
  readonly chat: readonly ChatItem[] | null;
  /** 「子智能体」标签里正在看哪位成员的任务；null 是成员列表。 */
  readonly member: string | null;
  readonly onMember: (role: string | null) => void;
  /** 面板占满整个任务页（对话收起）；只在宽屏上有这个状态。 */
  readonly maximized: boolean;
  readonly onToggleMaximize: () => void;
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

const TAB = "group flex h-7 min-w-0 max-w-[13rem] shrink-0 items-center gap-1.5 rounded-control px-2 text-body";
const TAB_ON = "bg-card font-medium text-foreground shadow-sm";
const TAB_OFF = "text-gray-600 hover:bg-gray-200";
const TOOL = "flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200";

const KIND_ICON: Record<FileKind, LucideIcon> = { image: FileImage, html: Code2, markdown: FileText, text: FileText, pdf: FileText, other: File };

/** 一个标签：16px 图标加省略的名字；文件标签右边有关闭 ×，悬停、聚焦和当前标签上才露出来。 */
function Tab({ label, title = label, Icon, active, onSelect, onClose }: { label: string; /** 悬停时看到的全名，文件标签里是完整路径。 */ title?: string; Icon: LucideIcon; active: boolean; onSelect: () => void; onClose?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  // 标签多了会横向滚动：选中的那个滚到看得见。
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <span ref={ref} className={cn(TAB, active ? TAB_ON : TAB_OFF)}>
      <button type="button" aria-pressed={active} title={title} className="flex min-w-0 flex-1 items-center gap-1.5 outline-none" onClick={onSelect}>
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {onClose ? (
        <button type="button" aria-label={`关闭 ${label}`} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-control opacity-0 hover:bg-gray-200 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100", active && "opacity-100")} onClick={onClose}>
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

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
 * 右侧详情面板：像浏览器标签页，第一个是概览，团队任务第二个固定是「子智能体」，点产物会多开一个预览标签。
 * 概览里按点击的路径换页：首页（入口和产物）、全部产物，开发者模式下还有调试信息；成员的任务在「子智能体」里。
 * 宽屏时是并排的一列，灰底托着白卡片，不画边框，左边缘可以拖动调宽，也可以最大化占满整个任务页；
 * 窄屏（<1024px）时是从右边滑出的抽屉，由页头的按钮打开。
 */
export function TaskPanel({ plan, nodes, task, reserved, pendingSwitches, nodeActions, attempts, events, files, omitted, openFiles, active, overview, chat, member, onMember, maximized, onToggleMaximize, onOverview, nameOf, roles, team, stageOf, onActivate, onOpenFile, onCloseFile, onCollapse }: TaskPanelProps) {
  const developer = useDeveloperMode();
  const wide = useMediaQuery(BREAKPOINT.lg);
  const panel = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(() => readPanelWidth() ?? defaultPanelWidth());
  const commitWidth = (next: number) => {
    const clamped = clampPanelWidth(next);
    setWidth(clamped);
    writePanelWidth(clamped);
  };
  const activeFile = openFiles.find((file) => fileKey(file) === active);
  const shown = visibleArtifacts(files);
  const page = overview.kind === "developer" && !developer ? HOME : overview;
  const back = () => onOverview(HOME);
  const full = maximized && wide;
  return (
    <aside
      ref={panel}
      aria-label="任务详情"
      style={{ [PANEL_WIDTH_VAR]: `${width}px` } as CSSProperties}
      className={cn("relative flex min-h-0 flex-col bg-muted max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(26rem,100vw)] max-lg:shadow-xl", full ? "min-w-0 flex-1" : "w-[var(--task-panel-w)] shrink-0 lg:max-w-[min(60rem,70vw)]")}
    >
      {wide && !full ? <PanelResizeHandle panel={panel} width={width} onCommit={commitWidth} onCollapse={onCollapse} /> : null}
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        {/* 概览和子智能体钉在左边；只有文件标签在自己的区域里横向滚动。 */}
        <Tab label="概览" Icon={LayoutList} active={active === OVERVIEW} onSelect={() => onActivate(OVERVIEW)} />
        {team && chat ? <Tab label="子智能体" Icon={Bot} active={active === AGENTS} onSelect={() => onActivate(AGENTS)} /> : null}
        <div data-testid="file-tabs" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {openFiles.map((file) => {
            const key = fileKey(file);
            return <Tab key={key} label={file.name.slice(file.name.lastIndexOf("/") + 1)} title={file.name} Icon={KIND_ICON[fileKind(file.name, file.mediaType)]} active={active === key} onSelect={() => onActivate(key)} onClose={() => onCloseFile(key)} />;
          })}
        </div>
        {wide ? (
          <button type="button" aria-label={full ? "还原" : "最大化"} title={full ? "还原（Esc）" : "最大化"} className={TOOL} onClick={onToggleMaximize}>
            {full ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
          </button>
        ) : null}
        <button type="button" aria-label="收起详情" className={TOOL} onClick={onCollapse}>
          <PanelRightClose aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {activeFile ? (
        <ArtifactFilePreview key={fileKey(activeFile)} file={activeFile} />
      ) : active === AGENTS && team && chat ? (
        <SubAgentsView chat={chat} team={team} files={files} totalFiles={shown.length} role={member} onRole={onMember} onOpenFile={onOpenFile} onOpenAllFiles={() => onOverview({ kind: "artifacts" })} />
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
                {shown.length === 0 ? <p className="mt-2 text-small text-muted-foreground">暂无产物</p> : <ArtifactTree files={shown} onOpen={onOpenFile} />}
                <OmittedNotice omitted={omitted} />
              </details>
            </div>
          ) : null}
          {page.kind === "artifacts" ? (
            <div data-testid="panel-artifacts">
              <SubHeader onBack={back}>全部产物</SubHeader>
              <FileList files={shown} onOpen={onOpenFile} omitted={omitted} />
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
