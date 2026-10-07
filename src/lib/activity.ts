import type { Segment, Step, StepState } from "./conversation";
import { parseTodos, TODO_TOOL, type TodoItem } from "./todos";

/**
 * How an agent reply's tool calls read to a person: one line each (已读取 foo.ts), consecutive reads/searches/edits/commands
 * folded into one summary line (已读取 3 个文件 · 已运行 1 个命令). The tool names are the ones the runtime registers
 * (AgentScope's toolkit: Read, Glob, Grep, Edit, Write, Bash, Skill; Orbit's: ask_user, TodoWrite, TaskCreate/Update/List/Get,
 * team_assign, team_note, the budget and unplannable tools). Anything else, such as a connector's tool, reads 已调用 <name>.
 * The wording lives here, in one place, like the rest of the display language (docs/design-system.md).
 */

export type ToolCategory = "read" | "search" | "list" | "edit" | "create" | "command" | "web" | "skill" | "ask" | "plan" | "task" | "team" | "budget" | "other";

interface ToolSpec {
  readonly category: ToolCategory;
  /** 已读取 */
  readonly done: string;
  /** 正在读取 */
  readonly doing: string;
  /** 读取失败 */
  readonly failed: string;
  /** 读取: the verb alone, for 已拒绝读取 and 已中断读取. */
  readonly base: string;
  /** What to say when the arguments gave no subject: 已读取文件. */
  readonly noun?: string;
  /** The subject out of the call's `args_preview`; empty when there is none to show. `titleOf` names a plan node by its id, when the caller has the plan. */
  readonly subject?: (args: string, titleOf?: TitleOf) => string;
}

/** The title of a plan node by its id; undefined when the plan has no such node (or is not loaded). */
export type TitleOf = (nodeId: string) => string | undefined;

/** What the runtime cuts a tool result to (`result_preview`, orbit_worker/ledger_middleware.py): a result this long may have been cut. */
export const RESULT_PREVIEW_CHARS = 200;

/** Whether a step's `result` is likely cut short upstream: it fills the whole preview. */
export const isResultCut = (result: string): boolean => [...result].length >= RESULT_PREVIEW_CHARS;

// ---- reading `args_preview` ------------------------------------------------------------------------------------------------
// The preview is the call's JSON arguments cut to 256 characters, so it may be broken off in the middle of a string.

function parseObject(args: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(args);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The string value of `key` in a (possibly truncated) JSON object; the first match anywhere when it is not at the top level. */
export function pickArg(args: string, key: string): string {
  const value = parseObject(args)?.[key];
  if (typeof value === "string") return value;
  const found = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(args);
  if (!found) return "";
  const raw = found[1].replace(/\\$/, "");
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

const firstArg = (args: string, keys: readonly string[]) => keys.map((key) => pickArg(args, key)).find((value) => value.trim() !== "") ?? "";
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const relativePath = (path: string) => path.replace(/^\/workspace\//, "");
const quoted = (text: string) => (text ? `“${oneLine(text)}”` : "");

const fileOf = (args: string) => relativePath(oneLine(firstArg(args, ["file_path", "path", "notebook_path"])));
const dirOf = (args: string) => {
  const path = relativePath(oneLine(pickArg(args, "path")));
  return path ? (path.endsWith("/") ? path : `${path}/`) : oneLine(pickArg(args, "pattern"));
};
const hasArg = (args: string, key: string) => new RegExp(`"${key}"\\s*:`).test(args);

const TASK_STATUS: Readonly<Record<string, string>> = { pending: "待办", in_progress: "进行中", completed: "已完成", deleted: "已删除" };

/** What a TaskUpdate changed, in a few words: the new status, the dependencies, the owner or the description. */
function updateNote(args: string): string {
  const status = oneLine(pickArg(args, "status"));
  if (status) return TASK_STATUS[status] ?? status;
  if (["add_blocked_by", "add_blocks", "blocked_by", "blocks"].some((key) => hasArg(args, key))) return "设置依赖";
  const owner = oneLine(pickArg(args, "owner"));
  if (owner) return `指派给 ${owner}`;
  return hasArg(args, "description") ? "修改描述" : "";
}

/** The task's own subject, else its title in the plan; then what changed. With no title the note stands alone, glued to the verb: 已更新任务（设置依赖）. */
function updateSubject(args: string, titleOf?: TitleOf): string {
  const title = oneLine(pickArg(args, "subject")) || oneLine(titleOf?.(pickArg(args, "task_id")) ?? "");
  const note = updateNote(args);
  return `${title}${note ? `（${note}）` : ""}`;
}

const commandOf = (args: string) => oneLine(firstArg(args, ["description", "command"]));

const TOOLS: Readonly<Record<string, ToolSpec>> = {
  Read: { category: "read", done: "已读取", doing: "正在读取", failed: "读取失败", base: "读取", noun: "文件", subject: fileOf },
  Glob: { category: "list", done: "已列出", doing: "正在列出", failed: "列出失败", base: "列出", noun: "目录", subject: dirOf },
  Grep: { category: "search", done: "已搜索", doing: "正在搜索", failed: "搜索失败", base: "搜索", subject: (args) => quoted(pickArg(args, "pattern")) },
  Edit: { category: "edit", done: "已编辑", doing: "正在编辑", failed: "编辑失败", base: "编辑", noun: "文件", subject: fileOf },
  NotebookEdit: { category: "edit", done: "已编辑", doing: "正在编辑", failed: "编辑失败", base: "编辑", noun: "文件", subject: fileOf },
  Write: { category: "create", done: "已创建", doing: "正在创建", failed: "创建失败", base: "创建", noun: "文件", subject: fileOf },
  Bash: { category: "command", done: "已运行命令", doing: "正在运行命令", failed: "运行命令失败", base: "运行命令", subject: commandOf },
  PowerShell: { category: "command", done: "已运行命令", doing: "正在运行命令", failed: "运行命令失败", base: "运行命令", subject: commandOf },
  WebFetch: { category: "web", done: "已打开网页", doing: "正在打开网页", failed: "打开网页失败", base: "打开网页", subject: (args) => oneLine(pickArg(args, "url")) },
  WebSearch: { category: "search", done: "已搜索网页", doing: "正在搜索网页", failed: "搜索网页失败", base: "搜索网页", subject: (args) => quoted(firstArg(args, ["query", "q"])) },
  Skill: { category: "skill", done: "已加载技能", doing: "正在加载技能", failed: "加载技能失败", base: "加载技能", subject: (args) => oneLine(pickArg(args, "skill")) },
  ask_user: { category: "ask", done: "已向你提问", doing: "正在向你提问", failed: "提问失败", base: "向你提问", subject: (args) => oneLine(pickArg(args, "question")) },
  [TODO_TOOL]: { category: "plan", done: "已更新计划", doing: "正在更新计划", failed: "更新计划失败", base: "更新计划" },
  TaskCreate: { category: "task", done: "已创建任务", doing: "正在创建任务", failed: "创建任务失败", base: "创建任务", subject: (args) => oneLine(pickArg(args, "subject")) },
  TaskUpdate: { category: "task", done: "已更新任务", doing: "正在更新任务", failed: "更新任务失败", base: "更新任务", subject: updateSubject },
  TaskList: { category: "task", done: "已查看任务计划", doing: "正在查看任务计划", failed: "查看任务计划失败", base: "查看任务计划" },
  TaskGet: { category: "task", done: "已查看任务", doing: "正在查看任务", failed: "查看任务失败", base: "查看任务" },
  team_assign: { category: "team", done: "已分配任务给", doing: "正在分配任务给", failed: "分配任务失败", base: "分配任务给", subject: (args) => oneLine(pickArg(args, "member")) },
  team_note: { category: "team", done: "已发布团队留言", doing: "正在发布团队留言", failed: "发布团队留言失败", base: "发布团队留言", subject: (args) => oneLine(pickArg(args, "text")) },
  orbit_request_budget_extension: { category: "budget", done: "已申请追加预算", doing: "正在申请追加预算", failed: "申请追加预算失败", base: "申请追加预算" },
  orbit_declare_unplannable: { category: "budget", done: "已说明无法拆分任务", doing: "正在说明无法拆分任务", failed: "说明无法拆分任务失败", base: "说明无法拆分任务", subject: (args) => oneLine(pickArg(args, "reason")) },
};

// Names that other tool providers spell differently.
const ALIASES: Readonly<Record<string, string>> = { web_fetch: "WebFetch", webfetch: "WebFetch", web_search: "WebSearch", websearch: "WebSearch", askuser: "ask_user", todowrite: "TodoWrite", bash: "Bash", read: "Read", write: "Write", edit: "Edit", grep: "Grep", glob: "Glob", skill: "Skill" };

function specOf(tool: string): { spec: ToolSpec; known: boolean } {
  const spec = TOOLS[tool] ?? TOOLS[ALIASES[tool.toLowerCase()] ?? ""];
  if (spec) return { spec, known: true };
  return { spec: { category: "other", done: "已调用", doing: "正在调用", failed: "调用失败", base: "调用" }, known: false };
}

export const toolCategory = (tool: string): ToolCategory => specOf(tool).spec.category;

export interface StepView {
  readonly category: ToolCategory;
  /** The whole line: 已读取 foo.ts. */
  readonly text: string;
  /** The `$ command` of a command, when its arguments gave one. */
  readonly command: string;
}

/** What a step says about itself in its state. `Step.state` stays as the event gave it; the caller decides when a running step is really over. */
export function describeStep(step: Pick<Step, "tool" | "args">, state: StepState, titleOf?: TitleOf): StepView {
  const { spec, known } = specOf(step.tool);
  const subject = known ? spec.subject?.(step.args, titleOf) ?? "" : "";
  const spaced = subject.startsWith("（") ? subject : ` ${subject}`;
  const tail = known ? (subject ? spaced : spec.noun ?? "") : ` ${step.tool}`;
  const command = spec.category === "command" ? oneLine(pickArg(step.args, "command")) : "";
  switch (state) {
    case "running":
      return { category: spec.category, text: `${spec.doing}${tail}`, command };
    case "success":
      return { category: spec.category, text: `${spec.done}${tail}`, command };
    case "error":
      // 读取失败 foo.ts: the failure says what failed on, so an unknown tool keeps its name in front.
      return { category: spec.category, text: known ? `${spec.failed}${subject ? spaced : ""}` : `调用 ${step.tool} 失败`, command };
    case "denied":
      return { category: spec.category, text: `已拒绝${spec.base}${tail}`, command };
    case "interrupted":
      return { category: spec.category, text: `已中断${spec.base}${tail}`, command };
  }
}

/** A running step of a reply that is over never got its end: it reads as interrupted, not as still running. */
export const settledState = (state: StepState, active: boolean): StepState => (state === "running" && !active ? "interrupted" : state);

// ---- the plan (TodoWrite) --------------------------------------------------------------------------------------------------

export const isPlanStep = (step: Pick<Step, "tool">): boolean => step.tool === TODO_TOOL;

export type PlanStatus = TodoItem["status"] | "failed";
export interface PlanItem {
  readonly content: string;
  readonly status: PlanStatus;
}

export const planItems = (step: Pick<Step, "args">): readonly PlanItem[] | null => parseTodos(step.args);

/** 已创建计划，共 5 项 for the first list of a reply, 已更新计划 · 已完成 2/5 项 for the ones after it. */
export function planText(step: Pick<Step, "args">, state: StepState, first: boolean): string {
  if (state === "running") return "正在更新计划";
  if (state === "error") return "更新计划失败";
  if (state === "denied") return "已拒绝更新计划";
  if (state === "interrupted") return "已中断更新计划";
  const items = planItems(step);
  if (!items) return first ? "已创建计划" : "已更新计划";
  if (first) return `已创建计划，共 ${items.length} 项`;
  return `已更新计划 · 已完成 ${items.filter((item) => item.status === "completed").length}/${items.length} 项`;
}

// ---- groups ----------------------------------------------------------------------------------------------------------------

const GROUPABLE: ReadonlySet<ToolCategory> = new Set(["read", "search", "list", "edit", "create", "command"]);

export type TimelineItem =
  | { readonly kind: "text"; readonly id: string; readonly text: string }
  | { readonly kind: "step"; readonly id: string; readonly step: Step }
  | { readonly kind: "group"; readonly id: string; readonly steps: readonly Step[] };

/**
 * The segments of a reply as rows: two or more reads/searches/lists/edits/commands in a row, with no words of the model between
 * them, become one group. A group is named by its first step, so the name does not change as the group grows.
 */
export function timelineItems(segments: readonly Segment[]): readonly TimelineItem[] {
  const items: TimelineItem[] = [];
  let run: Step[] = [];
  const flush = () => {
    if (run.length === 1) items.push({ kind: "step", id: run[0].id, step: run[0] });
    else if (run.length > 1) items.push({ kind: "group", id: `group:${run[0].id}`, steps: run });
    run = [];
  };
  for (const segment of segments) {
    if (segment.kind === "text") {
      flush();
      items.push({ kind: "text", id: segment.id, text: segment.text });
    } else if (GROUPABLE.has(toolCategory(segment.step.tool))) {
      run.push(segment.step);
    } else {
      flush();
      items.push({ kind: "step", id: segment.step.id, step: segment.step });
    }
  }
  flush();
  return items;
}

/** The first TodoWrite of the reply: it creates the plan, the ones after it update it. */
export function firstPlanId(segments: readonly Segment[]): string {
  for (const segment of segments) if (segment.kind === "step" && isPlanStep(segment.step)) return segment.step.id;
  return "";
}

const SUMMARY: ReadonlyArray<{ readonly category: ToolCategory; readonly text: (count: number) => string }> = [
  { category: "read", text: (count) => `已读取 ${count} 个文件` },
  { category: "search", text: (count) => `已搜索 ${count} 次` },
  { category: "list", text: (count) => `已列出 ${count} 个目录` },
  { category: "edit", text: (count) => `已编辑 ${count} 个文件` },
  { category: "create", text: (count) => `已创建 ${count} 个文件` },
  { category: "command", text: (count) => `已运行 ${count} 个命令` },
];
// When a group holds more kinds than fit, the ones that changed something win.
const IMPORTANCE: readonly ToolCategory[] = ["edit", "create", "command", "search", "read", "list"];
const MAX_PARTS = 3;

/** 已读取 3 个文件 · 已搜索 2 次 · 已运行 1 个命令: at most three kinds, then …. */
export function groupSummary(steps: readonly Step[]): string {
  const counts = new Map<ToolCategory, number>();
  for (const step of steps) counts.set(toolCategory(step.tool), (counts.get(toolCategory(step.tool)) ?? 0) + 1);
  const kept = new Set(IMPORTANCE.filter((category) => counts.has(category)).slice(0, MAX_PARTS));
  const parts = SUMMARY.filter((part) => kept.has(part.category)).map((part) => part.text(counts.get(part.category) ?? 0));
  return counts.size > kept.size ? `${parts.join(" · ")} …` : parts.join(" · ");
}

/** The kind of call that stands for the group in the icon: a change over a command over a search over a read. */
export function groupCategory(steps: readonly Step[]): ToolCategory {
  const present = new Set(steps.map((step) => toolCategory(step.tool)));
  if (present.has("edit") || present.has("create")) return "edit";
  return (["command", "search", "list", "read"] as const).find((category) => present.has(category)) ?? "other";
}

// ---- numbers and times -----------------------------------------------------------------------------------------------------

/** 12s, 1m 41s, 2h 5m. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** The time under a message: 9:05 today, 昨天 9:05, 10月3日 9:05 before that. */
export function replyTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const clock = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return clock;
  if (days === 1) return `昨天 ${clock}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

/** The arguments of a call for the expanded row: pretty when they are whole JSON, as they came when they were cut off. */
export function prettyArgs(args: string): string {
  if (args === "" || args === "{}") return "";
  const object = parseObject(args);
  return object ? JSON.stringify(object, null, 2) : args;
}
