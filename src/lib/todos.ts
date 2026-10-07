import type { MemberStatus } from "./chat";
import type { Step } from "./conversation";
import type { NodeRole } from "./display";
import type { TaskEvent } from "./tasks";

/** 运行时的 TodoWrite 工具：每次调用都用新清单替换整份旧清单。 */
export const TODO_TOOL = "TodoWrite";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  readonly content: string;
  readonly status: TodoStatus;
}

export const isTodoStep = (step: Pick<Step, "tool">): boolean => step.tool === TODO_TOOL;

const STATUSES: readonly string[] = ["pending", "in_progress", "completed"];

/** 一次 TodoWrite 调用的清单；入参不是完整 JSON（流式中被截断的预览）时为 null。 */
export function parseTodos(argsPreview: string): readonly TodoItem[] | null {
  let input: unknown;
  try {
    input = JSON.parse(argsPreview);
  } catch {
    return null;
  }
  const todos = (input as { todos?: unknown } | null)?.todos;
  if (!Array.isArray(todos)) return null;
  return todos.flatMap((item): TodoItem[] => {
    const { content, status } = (item ?? {}) as { content?: unknown; status?: unknown };
    return typeof content === "string" && content.trim() !== "" && typeof status === "string" && STATUSES.includes(status) ? [{ content, status: status as TodoStatus }] : [];
  });
}

/**
 * 任务当前的执行清单：最后一次成功的 TodoWrite 调用的入参。
 * 取持久的 `tool.call_finished` 事件（`tool.call_started` 的预览会被截断，也不落库），入参是 `payload.args_preview`
 * 里的 JSON `{"todos":[{content,status}]}`。事件里入参的位置如果变了，只改这一个函数。
 * 有专家团时只认领队的（事件带 team_role 时必须等于 `leader`）；入参为空或读不出来的调用跳过。没有调用过时返回 null。
 */
export function latestTodos(events: readonly TaskEvent[], leader = ""): readonly TodoItem[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const { type, payload } = events[i];
    if (type !== "tool.call_finished" || payload.tool_name !== TODO_TOOL || payload.state !== "success") continue;
    const role = typeof payload.team_role === "string" ? payload.team_role : "";
    if (role !== "" && leader !== "" && role !== leader) continue;
    if (typeof payload.args_preview !== "string" || payload.args_preview === "") continue;
    const todos = parseTodos(payload.args_preview);
    if (todos) return todos;
  }
  return null;
}

// ---- 执行清单的来源 --------------------------------------------------------------------------------------------------------

export type ChecklistStatus = TodoStatus | "failed";

export interface ChecklistItem {
  readonly content: string;
  readonly status: ChecklistStatus;
  /** 计划清单里这一项归哪位成员；TodoWrite 的清单没有。 */
  readonly owner?: { readonly role: string; readonly name: string; readonly label: string };
}

export interface ChecklistInput {
  readonly events: readonly TaskEvent[];
  /** 领队的角色名（团队任务）；单个智能体为空。 */
  readonly leader: string;
  readonly nodes: ReadonlyArray<{
    readonly node_id: string;
    readonly type: string;
    readonly title: string;
    readonly status: string;
    readonly depends_on?: readonly string[];
    readonly parent_node_id?: string | null;
    readonly review_round?: number | null;
  }>;
  readonly roles: Readonly<Record<string, NodeRole>>;
  readonly stageNodeIds: ReadonlySet<string>;
  /** 事件里最新的节点状态，比计划快照新。 */
  readonly liveNodes: Readonly<Record<string, { readonly status: string }>>;
  /** 名册里每位成员现在的状态（chat.latestRosterStatus）。 */
  readonly roster: ReadonlyMap<string, MemberStatus>;
}

const PLANNING_TITLES = ["Explore and plan", "理解目标并规划"];

const IN_PROGRESS = ["RUNNING", "VERIFYING", "RETRY_PENDING", "AWAITING_APPROVAL", "AWAITING_INPUT", "CANCELLING"];

/** 节点状态到清单状态：执行中算进行中，完成算完成，失败和取消算失败，其余还没开始。 */
export function nodeChecklistStatus(status: string): ChecklistStatus {
  if (IN_PROGRESS.includes(status)) return "in_progress";
  if (status === "COMPLETED" || status === "SKIPPED") return "completed";
  if (status === "FAILED" || status === "CANCELLED") return "failed";
  return "pending";
}

const FROM_ROSTER: Record<MemberStatus, ChecklistStatus> = { running: "in_progress", done: "completed", failed: "failed", waiting: "pending" };

const TITLE_CHARS = 200;
const MENTION_PREFIX = /^@[^:：]*[:：]\s*/;
const firstLine = (text: string): string => text.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";

/**
 * 运行时把用户的一条消息变成一个计划节点（任务全部做完后的追问，或 @ 成员的消息）：无父节点、无依赖，标题是消息的第一行
 * （@ 成员的是「@名字: 第一行」，都截到 200 字）。节点上没有「来自用户」的字段，所以只能拿标题对 `message.user` 事件的文字。
 * 同时要求没有父节点、没有依赖、不是复盘：领队自己排的计划节点挂在「理解目标并规划」下面或依赖别的节点，不会被误伤。
 */
function userMessageNodeIds(input: Pick<ChecklistInput, "events" | "nodes">): ReadonlySet<string> {
  const lines = input.events.filter((event) => event.type === "message.user" && typeof event.payload.text === "string").map((event) => firstLine(event.payload.text as string)).filter((line) => line !== "");
  if (lines.length === 0) return new Set();
  // 标题被截断（满 200 字）时，只要消息的第一行以它开头就算。
  const answers = (title: string): boolean => {
    const body = title.replace(MENTION_PREFIX, "");
    return lines.some((line) => line === title || line === body || (title.length >= TITLE_CHARS && line.startsWith(body)));
  };
  return new Set(
    input.nodes
      .filter((node) => node.type === "agent_turn" && !node.parent_node_id && (node.depends_on ?? []).length === 0 && !((node.review_round ?? 0) > 0) && answers(node.title))
      .map((node) => node.node_id),
  );
}

/**
 * 执行清单从哪来：领队给成员（或留给自己）建了计划节点（计划层的团队）时，每个节点一项，按计划里的顺序，后几轮的节点出现就加进来；
 * 其余（单个智能体、团队阶段里的领队）用最后一次 TodoWrite。
 * 一位成员最新的那个节点以名册里这位成员的状态为准：清单和名册讲同一件事，不会一个说做完了、一个说还在做。
 */
export function executionChecklist(input: ChecklistInput): readonly ChecklistItem[] | null {
  const { nodes, roles, stageNodeIds, liveNodes, roster } = input;
  // 成员的节点和领队自己做的工作节点一样是清单项；领队复盘和开头的「理解目标并规划」不是。
  const owned = nodes.filter((node) => node.type !== "team_stage" && !stageNodeIds.has(node.node_id) && !PLANNING_TITLES.includes(node.title) && (roles[node.node_id]?.kind === "member" || roles[node.node_id]?.kind === "leader"));
  // 用户的消息（给领队的追问、@ 成员）运行时也建节点，但那是回答，不是领队排的步骤。
  const answers = userMessageNodeIds(input);
  const mine = owned.filter((node) => !answers.has(node.node_id));
  if (mine.length === 0) return latestTodos(input.events, input.leader);
  // 名册里成员的状态是他手上最新那件事的：最新的是在回答用户时，不能拿它改写已排好的步骤。
  const lastOf = new Map<string, string>();
  for (const node of owned) lastOf.set(roles[node.node_id].role, node.node_id);
  return mine.map((node): ChecklistItem => {
    const role = roles[node.node_id];
    const fromRoster = lastOf.get(role.role) === node.node_id ? roster.get(role.role) : undefined;
    return {
      content: node.title,
      status: fromRoster ? FROM_ROSTER[fromRoster] : nodeChecklistStatus(liveNodes[node.node_id]?.status ?? node.status),
      owner: { role: role.role, name: role.name, label: role.label },
    };
  });
}
