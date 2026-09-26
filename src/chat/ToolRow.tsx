import { memo, useState, type ComponentType } from "react";
import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
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
import { describeTool, summarizeTools, toolTitle, type ToolLabel } from "../lib/events/toolLabels";
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
  running: { text: "进行中", icon: LoaderCircle, tone: "text-primary" },
  success: { text: "完成", icon: CircleCheck, tone: "text-emerald-600" },
  error: { text: "失败", icon: CircleX, tone: "text-destructive" },
  denied: { text: "已拒绝", icon: CircleSlash, tone: "text-amber-600" },
  interrupted: { text: "已中断", icon: CircleSlash, tone: "text-[#888]" },
  unknown: { text: "未收到结果", icon: CircleHelp, tone: "text-[#888]" },
};

const TOOL_ERROR_TEXT: Record<string, string> = {
  APPROVAL_REJECTED: "你拒绝了这一步，助手没有执行它。",
  PERMISSION_DENIED: "这件任务的权限不允许这一步。",
  DELEGATION_LIMIT_EXCEEDED: "子助手数量或层级超过了上限。",
  QUESTION_CANCELLED: "提问已取消。",
  SESSION_ABORTED: "任务已停止，这一步没有完成。",
};

export function isFailedState(state: ToolRunState) {
  return state === "error" || state === "denied" || state === "interrupted";
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
  const failed = isFailedState(call.state);
  const took = duration(call);
  const errorText = call.errorCode ? (TOOL_ERROR_TEXT[call.errorCode] ?? call.errorCode) : "";

  return (
    <div
      data-testid="tool-row"
      data-state={call.state}
      className={cn("rounded-lg border text-xs", failed ? "border-destructive/30 bg-destructive/5" : "border-[#ececee] bg-white", compact && "border-transparent bg-transparent")}
    >
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", failed ? "text-destructive" : "text-[#888]")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className={cn(failed ? "text-destructive" : "text-[#333]")}>{label.verb}</span>
          {label.target ? <span className={cn("ml-1 font-medium", failed ? "text-destructive" : "text-[#111]")}>{label.target}</span> : null}
          {call.agentPath && call.agentPath !== "main" ? <span className="ml-2 text-[11px] text-[#999]">{call.agentPath}</span> : null}
        </span>
        {took ? <span className="shrink-0 tabular-nums text-[11px] text-[#999]">{took}</span> : null}
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px]", state.tone)}>
          <StateIcon className={cn("h-3.5 w-3.5", call.state === "running" && "animate-spin")} aria-hidden />
          {state.text}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-[#aaa] transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {failed && errorText ? <p className="text-destructive px-2.5 pb-1.5 text-[11px]">{errorText}</p> : null}
      {open ? (
        <div className="border-t border-[#f0f0f1] px-2.5 pb-2">
          <p className="mt-2 text-[11px] text-[#888]">
            工具 <span className="font-mono text-[#555]">{call.toolName || "未知"}</span>
            {call.callId ? <span className="ml-2 font-mono text-[#aaa]">{call.callId}</span> : null}
          </p>
          <Detail title="参数（已脱敏，最多 256 字）" text={call.argsPreview} />
          {call.state === "running" ? null : <Detail title="结果" text={call.resultText} />}
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
    a.finishedAt === b.finishedAt
  );
}

/** Three or more calls in a row collapse into one summary line, as in 「读取 2 个文件，执行命令」. */
export const ToolGroup = memo(function ToolGroup({ calls }: { calls: ToolCallView[] }) {
  const [open, setOpen] = useState(false);
  if (calls.length < 3) {
    return (
      <div className="space-y-1.5">
        {calls.map((call) => (
          <ToolRow key={call.key} call={call} />
        ))}
      </div>
    );
  }
  const labels = calls.map((call) => describeTool(call.toolName, call.argsPreview));
  const failedCount = calls.filter((call) => isFailedState(call.state)).length;
  const running = calls.some((call) => call.state === "running");
  return (
    <div data-testid="tool-group" className={cn("rounded-lg border text-xs", failedCount ? "border-destructive/30 bg-destructive/5" : "border-[#ececee] bg-white")}>
      <button type="button" aria-expanded={open} className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen((value) => !value)}>
        <Layers className="h-3.5 w-3.5 shrink-0 text-[#888]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[#333]" title={labels.map(toolTitle).join("\n")}>
          {summarizeTools(labels)}
        </span>
        <span className="shrink-0 text-[11px] text-[#999]">{calls.length} 步</span>
        {failedCount ? <span className="text-destructive shrink-0 text-[11px]">{failedCount} 步失败</span> : null}
        {running ? <LoaderCircle className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" aria-label="进行中" /> : null}
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
}, (a, b) => a.calls.length === b.calls.length && a.calls.every((call, index) => sameCall(call, b.calls[index])));
