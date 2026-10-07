import { ChevronRight, CircleAlert, CircleCheck, CircleDot, CircleSlash, CircleX, Circle, FilePlus, FileText, FolderOpen, Globe, ListChecks, ListTodo, MessageCircleQuestion, Pencil, Search, ShieldAlert, Sparkles, Terminal, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { useCallback, useContext, useMemo, useState } from "react";
import { describeStep, firstPlanId, isResultCut, groupCategory, groupSummary, isPlanStep, planItems, planText, prettyArgs, settledState, timelineItems, type PlanStatus, type ToolCategory } from "../../lib/activity";
import { cn } from "../../lib/cn";
import type { Segment, Step, StepState } from "../../lib/conversation";
import { RichText } from "../markdown/RichText";
import { StepTitles } from "./stepTitles";

/** Which rows and groups are open, by step / group id: it outlives re-renders and regrouping while the reply streams. */
export interface Expansion {
  readonly isOpen: (id: string) => boolean;
  readonly toggle: (id: string) => void;
}

export function useExpansion(): Expansion {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback((id: string) => open.has(id), [open]);
  const toggle = useCallback((id: string) => setOpen((current) => (current.has(id) ? new Set([...current].filter((item) => item !== id)) : new Set([...current, id]))), []);
  return useMemo(() => ({ isOpen, toggle }), [isOpen, toggle]);
}

const CATEGORY_ICON: Record<ToolCategory, LucideIcon> = {
  read: FileText,
  search: Search,
  list: FolderOpen,
  edit: Pencil,
  create: FilePlus,
  command: Terminal,
  web: Globe,
  skill: Sparkles,
  ask: MessageCircleQuestion,
  plan: ListChecks,
  task: ListTodo,
  team: Users,
  budget: Wallet,
  other: Wrench,
};

/** The icon says what kind of call it was; a call that went wrong says that instead. */
function StateIcon({ category, state }: { category: ToolCategory; state: StepState }) {
  if (state === "error") return <CircleAlert aria-hidden="true" data-icon="error" className="h-4 w-4 shrink-0 text-danger-700" />;
  if (state === "denied") return <ShieldAlert aria-hidden="true" data-icon="denied" className="h-4 w-4 shrink-0 text-warning-700" />;
  if (state === "interrupted") return <CircleSlash aria-hidden="true" data-icon="interrupted" className="h-4 w-4 shrink-0 text-gray-500" />;
  const Icon = CATEGORY_ICON[category];
  return <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />;
}

const ROW = "group/row inline-flex min-h-7 max-w-full items-center gap-2 rounded-control text-left text-body hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0 text-gray-500 transition-[opacity,transform]", open ? "rotate-90 opacity-100" : "opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 [@media(pointer:coarse)]:opacity-100")}
    />
  );
}

const PLAN_ICON: Record<PlanStatus, { Icon: LucideIcon; className: string; label: string }> = {
  completed: { Icon: CircleCheck, className: "text-success-700", label: "已完成" },
  in_progress: { Icon: CircleDot, className: "text-primary-700", label: "进行中" },
  pending: { Icon: Circle, className: "text-gray-400", label: "待办" },
  failed: { Icon: CircleX, className: "text-danger-700", label: "失败" },
};

function PlanDetail({ step }: { step: Step }) {
  const items = planItems(step);
  if (!items || items.length === 0) return <p className="pl-6 text-small text-muted-foreground">没有可显示的清单</p>;
  return (
    <ul data-testid="plan-items" className="space-y-1 pb-1 pl-6">
      {items.map((item, index) => {
        const { Icon, className, label } = PLAN_ICON[item.status];
        return (
          <li key={index} data-status={item.status} className="flex items-start gap-2 text-body text-gray-600">
            <Icon aria-label={label} className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
            <span className={cn("min-w-0 break-words", item.status === "completed" && "text-gray-500", item.status === "in_progress" && "text-foreground")}>{item.content}</span>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_TEXT: Record<StepState, string> = { running: "运行中…", success: "已完成", error: "运行失败", denied: "已拒绝", interrupted: "已中断" };

/** The expanded row: its arguments and what it returned, in a muted block; a command reads as `$ command`, its output and how it ended. */
function StepDetail({ step, state }: { step: Step; state: StepState }) {
  const titleOf = useContext(StepTitles);
  const { category, command } = describeStep(step, state, titleOf);
  // The runtime cuts a result to its first 200 characters; say so rather than let the text end mid-line.
  const cut = isResultCut(step.result) ? <span className="text-gray-500">{"\n…（已截断）"}</span> : null;
  if (category === "command") {
    return (
      <pre data-testid="step-detail" className="ml-6 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-muted px-3 py-2 font-mono text-caption text-gray-700">
        <span className="text-foreground">$ {command || prettyArgs(step.args) || "…"}</span>
        {step.result ? `\n${step.result}` : ""}
        {cut}
        {"\n\n"}
        <span className="text-gray-500">{STATUS_TEXT[state]}</span>
      </pre>
    );
  }
  const args = prettyArgs(step.args);
  const body = [args, step.result].filter((part) => part !== "").join("\n\n");
  return (
    <pre data-testid="step-detail" className="ml-6 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-muted px-3 py-2 font-mono text-caption text-gray-700">
      {body || <span className="text-gray-500">没有可显示的内容</span>}
      {cut}
    </pre>
  );
}

interface RowProps {
  readonly step: Step;
  readonly active: boolean;
  readonly first: boolean;
  readonly expansion: Expansion;
}

/** One tool call as one line. */
function ActivityRow({ step, active, first, expansion }: RowProps) {
  const state = settledState(step.state, active);
  const plan = isPlanStep(step);
  const titleOf = useContext(StepTitles);
  const { category, text } = describeStep(step, state, titleOf);
  const label = plan ? planText(step, state, first) : text;
  const open = expansion.isOpen(step.id);
  return (
    <div data-testid="activity-row" data-tool={step.tool} data-state={state} data-category={category}>
      <button type="button" aria-expanded={open} title={label} onClick={() => expansion.toggle(step.id)} className={cn(ROW, state === "error" ? "text-danger-700" : "text-gray-600")}>
        <StateIcon category={category} state={state} />
        <span className={cn("min-w-0 truncate", state === "running" && "shimmer-text")}>{label}</span>
        <Chevron open={open} />
      </button>
      {open ? plan ? <PlanDetail step={step} /> : <StepDetail step={step} state={state} /> : null}
    </div>
  );
}

interface GroupProps {
  readonly id: string;
  readonly steps: readonly Step[];
  readonly active: boolean;
  readonly firstPlan: string;
  readonly expansion: Expansion;
}

/** Reads, searches and commands in a row as one line: the summary, or the call that is running; open, the calls under a guide line. */
function ActivityGroup({ id, steps, active, firstPlan, expansion }: GroupProps) {
  const open = expansion.isOpen(id);
  const running = [...steps].reverse().find((step) => settledState(step.state, active) === "running");
  const summary = groupSummary(steps);
  const label = running ? describeStep(running, "running").text : summary;
  const failed = steps.some((step) => step.state === "error");
  const iconCategory = running ? describeStep(running, "running").category : groupCategory(steps);
  return (
    <div data-testid="activity-group" data-open={open ? "true" : "false"} data-running={running ? "true" : undefined}>
      <button type="button" aria-expanded={open} data-icon-category={iconCategory} title={running ? `${label}\n${summary}` : summary} onClick={() => expansion.toggle(id)} className={cn(ROW, "text-gray-600")}>
        {/* While the header names a call that is running, the icon is that call's; the settled summary takes the priority icon. */}
        <StateIcon category={iconCategory} state={failed && !running ? "error" : "success"} />
        <span data-testid="group-summary" className={cn("min-w-0 truncate", running && "shimmer-text")}>
          {label}
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div data-testid="group-items" className="ml-2 border-l border-border pl-3">
          {steps.map((step) => (
            <ActivityRow key={step.id} step={step} active={active} first={step.id === firstPlan} expansion={expansion} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ActivityTimelineProps {
  readonly segments: readonly Segment[];
  /** The reply is still going (running, or waiting for you). A step still running in a reply that is over was cut off, not running. */
  readonly active: boolean;
  /** Pass one to keep the open rows when this is unmounted (a collapsed process area); otherwise it keeps its own. */
  readonly expansion?: Expansion;
}

/** What an agent did, in the order it happened: its words of a round as text, its tool calls as one-line rows, folded into groups. */
export function ActivityTimeline({ segments, active, expansion }: ActivityTimelineProps) {
  const own = useExpansion();
  const state = expansion ?? own;
  const items = useMemo(() => timelineItems(segments), [segments]);
  const firstPlan = useMemo(() => firstPlanId(segments), [segments]);
  if (items.length === 0) return null;
  return (
    <div data-testid="activity-timeline" className="space-y-1">
      {items.map((item) => {
        if (item.kind === "text") {
          return (
            <div key={item.id} data-testid="activity-text" className="py-1">
              <RichText text={item.text} />
            </div>
          );
        }
        if (item.kind === "group") return <ActivityGroup key={item.id} id={item.id} steps={item.steps} active={active} firstPlan={firstPlan} expansion={state} />;
        return <ActivityRow key={item.id} step={item.step} active={active} first={item.step.id === firstPlan} expansion={state} />;
      })}
    </div>
  );
}
