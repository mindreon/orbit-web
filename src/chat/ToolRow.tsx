import { memo, useState, type ComponentType } from "react";
import {
  ChevronRight,
  CircleCheck,
  CircleSlash,
  CircleX,
  Code,
  FilePen,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  ListTodo,
  LoaderCircle,
  MessageCircleQuestion,
  Search,
  Terminal,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "../lib/cn";
import type { ToolCallView, ToolRunState } from "../lib/events/timeline";
import { describeTool, summarizeRun, toolTitle, toolVerb, type ToolLabel } from "../lib/events/toolLabels";
import { CopyButton } from "./CopyButton";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const VERB_ICONS: [RegExp, Icon][] = [
  [/^读取/, FileText],
  [/^(写入|修改)/, FilePen],
  [/^删除/, Trash2],
  [/^执行命令/, Terminal],
  [/^(搜索|查找文件)/, Search],
  [/^(联网搜索|打开网页)/, Globe],
  [/^查看目录/, FolderOpen],
  [/子助手/, Users],
  [/^更新待办/, ListTodo],
  [/^向你提问/, MessageCircleQuestion],
  [/Python/, Code],
];

function iconFor(label: ToolLabel): Icon {
  return VERB_ICONS.find(([pattern]) => pattern.test(label.verb))?.[1] ?? Wrench;
}

const STATE_VIEW: Record<ToolRunState, { text: string; icon: Icon; tone: string }> = {
  running: { text: "运行中", icon: LoaderCircle, tone: "text-primary" },
  success: { text: "成功", icon: CircleCheck, tone: "text-emerald-600" },
  failed: { text: "失败", icon: CircleX, tone: "text-destructive" },
  rejected: { text: "已拒绝", icon: CircleSlash, tone: "text-amber-600" },
};

export function isFailedState(state: ToolRunState) {
  return state === "failed" || state === "rejected";
}

function duration(call: ToolCallView) {
  if (!call.startedAt || !call.finishedAt) return "";
  const ms = Date.parse(call.finishedAt) - Date.parse(call.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function Detail({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] text-[#888]">
        <span>{title}</span>
        {text ? <CopyButton text={text} /> : null}
      </div>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#f6f6f7] px-2 py-1.5 font-mono text-[11px] leading-5 text-[#333]">
        {text || "（空）"}
      </pre>
    </div>
  );
}

export const ToolRow = memo(function ToolRow({ call, compact = false }: { call: ToolCallView; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = describeTool(call.toolName, call.argsPreview);
  const Icon = iconFor(label);
  const state = STATE_VIEW[call.state];
  const StateIcon = state.icon;
  const failed = call.state === "failed";
  const rejected = call.state === "rejected";
  const took = duration(call);

  return (
    <div
      data-testid="tool-row"
      data-state={call.state}
      className={cn(
        "rounded-lg border text-xs",
        failed ? "border-destructive/30 bg-destructive/5" : rejected ? "border-amber-200 bg-amber-50/60" : "border-[#ececee] bg-white",
        compact && "border-transparent bg-transparent",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", failed ? "text-destructive" : "text-[#888]")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className={cn(failed ? "text-destructive" : "text-[#333]")}>{toolVerb(label, call.state === "running")}</span>
          {label.target ? <span className={cn("ml-1 font-medium", failed ? "text-destructive" : "text-[#111]")}>{label.target}</span> : null}
          {call.agentPath && call.agentPath !== "main" ? <span className="ml-2 text-[11px] text-[#999]">子助手 · {call.agentPath}</span> : null}
        </span>
        {took ? <span className="shrink-0 tabular-nums text-[11px] text-[#999]">{took}</span> : null}
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px]", state.tone)}>
          <StateIcon className={cn("h-3.5 w-3.5", call.state === "running" && "animate-spin")} aria-hidden />
          {state.text}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-[#aaa] transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {call.note ? <p className={cn("px-2.5 pb-1.5 text-[11px]", failed ? "text-destructive" : "text-amber-700")}>{call.note}</p> : null}
      {open ? (
        <div className="border-t border-[#f0f0f1] px-2.5 pb-2">
          <p className="mt-2 text-[11px] text-[#888]">
            技术详情 · 工具 <span className="font-mono text-[#555]">{call.toolName || "未知"}</span>
            {call.callId ? <span className="ml-2 font-mono text-[#aaa]">{call.callId}</span> : null}
          </p>
          <Detail title="参数（已脱敏，最多 256 字）" text={call.argsPreview} />
          {call.state === "running" || (!call.resultText && call.note) ? null : <Detail title="结果" text={call.resultText} />}
          {call.errorCode ? <p className="mt-2 font-mono text-[11px] text-[#888]">错误码 {call.errorCode}</p> : null}
        </div>
      ) : null}
    </div>
  );
}, (a, b) => a.compact === b.compact && sameCall(a.call, b.call));

/** Timeline items are rebuilt on every event, so rows compare by content rather than identity. */
export function sameCall(a: ToolCallView, b: ToolCallView) {
  return (
    a.key === b.key &&
    a.state === b.state &&
    a.toolName === b.toolName &&
    a.argsPreview === b.argsPreview &&
    a.resultText === b.resultText &&
    a.errorCode === b.errorCode &&
    a.note === b.note &&
    a.finishedAt === b.finishedAt
  );
}

/** Splits calls into runs of consecutive same-kind calls, e.g. three reads in a row. */
function runsOf(calls: ToolCallView[]) {
  const runs: { labels: ToolLabel[]; calls: ToolCallView[] }[] = [];
  for (const call of calls) {
    const label = describeTool(call.toolName, call.argsPreview);
    const last = runs[runs.length - 1];
    if (last && last.labels[0].kind === label.kind) {
      last.labels.push(label);
      last.calls.push(call);
    } else runs.push({ labels: [label], calls: [call] });
  }
  return runs;
}

function ToolRun({ labels, calls }: { labels: ToolLabel[]; calls: ToolCallView[] }) {
  const [open, setOpen] = useState(false);
  const failedCount = calls.filter((call) => call.state === "failed").length;
  const rejectedCount = calls.filter((call) => call.state === "rejected").length;
  const running = calls.some((call) => call.state === "running");
  const Icon = iconFor(labels[0]);
  return (
    <div data-testid="tool-group" className={cn("rounded-lg border text-xs", failedCount ? "border-destructive/30 bg-destructive/5" : "border-[#ececee] bg-white")}>
      <button type="button" aria-expanded={open} className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen((value) => !value)}>
        <Layers className="h-3.5 w-3.5 shrink-0 text-[#888]" aria-hidden />
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#888]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[#333]" title={labels.map((label, index) => toolTitle(label, calls[index].state === "running")).join("\n")}>
          {running ? `正在${summarizeRun(labels)}` : summarizeRun(labels)}
        </span>
        {failedCount ? <span className="text-destructive shrink-0 text-[11px]">{failedCount} 个失败</span> : null}
        {rejectedCount ? <span className="shrink-0 text-[11px] text-amber-600">{rejectedCount} 个已拒绝</span> : null}
        {running ? (
          <LoaderCircle className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" aria-label="运行中" />
        ) : failedCount || rejectedCount ? null : (
          <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="成功" />
        )}
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-[#aaa] transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-1 border-t border-[#f0f0f1] p-1.5">
          {calls.map((call) => (
            <ToolRow key={call.key} call={call} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Consecutive calls of the same kind fold into one expandable line, e.g. 「读取 3 个文件」; single calls stay rows. */
export const ToolGroup = memo(function ToolGroup({ calls }: { calls: ToolCallView[] }) {
  return (
    <div className="space-y-1.5">
      {runsOf(calls).map((run) =>
        run.calls.length === 1 ? <ToolRow key={run.calls[0].key} call={run.calls[0]} /> : <ToolRun key={`run-${run.calls[0].key}`} labels={run.labels} calls={run.calls} />,
      )}
    </div>
  );
}, (a, b) => a.calls.length === b.calls.length && a.calls.every((call, index) => sameCall(call, b.calls[index])));
