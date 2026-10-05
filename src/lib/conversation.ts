import type { AttemptFailure, AttemptStatus, LiveBlock, TaskLiveState } from "./taskEvents";
import { joinSplits, splitThinking } from "./thinking";
import type { Task, TaskEvent } from "./tasks";

export type StepState = "running" | "success" | "error" | "denied" | "interrupted";

export interface Step {
  readonly id: string;
  readonly tool: string;
  readonly args: string;
  readonly result: string;
  readonly state: StepState;
}

export interface UserTurn {
  readonly kind: "user";
  readonly id: string;
  readonly text: string;
  readonly at: string;
  readonly interrupt: boolean;
}

export interface AgentTurn {
  readonly kind: "agent";
  readonly id: string;
  readonly attemptId: string;
  /** The plan node the attempt runs; empty until the page has seen the attempt start. */
  readonly nodeId: string;
  /** 同一次尝试里的第几段：你的每条消息会把尝试的输出切成下一段。 */
  readonly generation: number;
  readonly attemptNo: number;
  readonly status: AttemptStatus;
  readonly steps: readonly Step[];
  /** 最终回复；还没有时是正在流出的文字。模型写进回复里的推理已经拆出去，不在这里。 */
  readonly text: string;
  /** 模型写进回复里的推理，折叠显示。 */
  readonly thinking: string;
  readonly streaming: boolean;
  readonly truncated: boolean;
  readonly resumed: number;
  /** 失败时的原因分类（已失败的那段回复才有）。 */
  readonly failure?: AttemptFailure;
  readonly at: string;
}

export type Turn = UserTurn | AgentTurn;

const str = (payload: Record<string, unknown>, key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");

/** 该尝试当前正在写入的那段回复：数组里最后一段属于它的。 */
function lastAgentIndexOf(turns: readonly Turn[], attemptId: string): number {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.kind === "agent" && turn.attemptId === attemptId) return i;
  }
  return -1;
}

function updateAgent(turns: readonly Turn[], attemptId: string, change: (turn: AgentTurn) => AgentTurn): readonly Turn[] {
  const index = lastAgentIndexOf(turns, attemptId);
  if (index < 0) return turns;
  return turns.map((turn, i) => (i === index && turn.kind === "agent" ? change(turn) : turn));
}

function upsertStep(steps: readonly Step[], step: Step): readonly Step[] {
  return steps.some((item) => item.id === step.id) ? steps.map((item) => (item.id === step.id ? { ...item, ...step } : item)) : [...steps, step];
}

function fold(turns: readonly Turn[], event: TaskEvent): readonly Turn[] {
  const payload = event.payload;
  switch (event.type) {
    case "task.created":
      return [...turns, { kind: "user", id: event.event_id, text: str(payload, "goal"), at: event.occurred_at, interrupt: false }];
    case "message.user": {
      const text = str(payload, "text");
      const userTurn: UserTurn = { kind: "user", id: event.event_id, text, at: event.occurred_at, interrupt: payload.delivery === "interrupt" };
      // 你的消息会结束"正在和你对话的那段回复"：ask_user 有了结果（你的回答），后续输出开新的一段，落在你的消息下面。
      const target = turns[turns.length - 1];
      if (target?.kind !== "agent") return [...turns, userTurn];
      const open = target.status === "running" || target.status === "parked_approval" || target.status === "parked_input";
      if (!open) return [...turns, userTurn];
      const closed: AgentTurn = {
        ...target,
        steps: target.steps.map((step) =>
          step.tool === "ask_user" && step.state === "running" ? { ...step, state: "success", result: `用户回答：${text}` } : step,
        ),
      };
      const next: AgentTurn = {
        ...target,
        id: `${target.attemptId}#${target.generation + 1}`,
        generation: target.generation + 1,
        steps: [],
        text: "",
        thinking: "",
        streaming: false,
        truncated: false,
        at: event.occurred_at,
      };
      return [...turns.slice(0, -1), closed, userTurn, next];
    }
    case "attempt.started":
      return [
        ...turns,
        {
          kind: "agent",
          id: str(payload, "attempt_id"),
          attemptId: str(payload, "attempt_id"),
          nodeId: str(payload, "node_id"),
          generation: 0,
          attemptNo: Number(payload.attempt_no ?? 1),
          status: "running",
          steps: [],
          text: "",
          thinking: "",
          streaming: false,
          truncated: false,
          resumed: 0,
          at: event.occurred_at,
        },
      ];
    case "tool.call_started":
    case "tool.call_finished": {
      const finished = event.type === "tool.call_finished";
      const state = str(payload, "state");
      const step: Step = {
        id: str(payload, "tool_call_id") || event.event_id,
        tool: str(payload, "tool_name"),
        args: str(payload, "args_preview"),
        result: str(payload, "result_preview"),
        state: finished ? ((["success", "error", "denied", "interrupted"].includes(state) ? state : "success") as StepState) : "running",
      };
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({ ...turn, steps: upsertStep(turn.steps, step) }));
    }
    case "attempt.parked":
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({
        ...turn,
        status: payload.reason === "input" ? "parked_input" : "parked_approval",
      }));
    case "attempt.resumed":
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({ ...turn, status: "running" }));
    case "attempt.finished": {
      const outcome = str(payload, "outcome");
      const status: AttemptStatus = outcome === "completed" ? "completed" : outcome === "cancelled" ? "cancelled" : "failed";
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({ ...turn, status }));
    }
    default:
      return turns;
  }
}

/**
 * 把任务事件整理成对话：你说的话是一条，每次尝试是一条 Agent 回复，
 * 回复里带着它执行过的步骤（工具调用）。你在一次尝试中间的回答会把这次尝试切成多段，
 * 每段只带自己那部分输出。文字和状态取自已折叠的实时状态，事件重放后结果一样。
 */
export function buildTimeline(task: Task, events: readonly TaskEvent[], live: TaskLiveState): readonly Turn[] {
  const folded = events.reduce(fold, [] as readonly Turn[]);
  const withGoal: readonly Turn[] = folded.some((turn) => turn.kind === "user")
    ? folded
    : [{ kind: "user", id: `goal-${task.task_id}`, text: task.goal, at: task.created_at, interrupt: false }, ...folded];
  return withGoal.map((turn) => {
    if (turn.kind !== "agent") return turn;
    const attempt = live.attempts.find((item) => item.attemptId === turn.attemptId);
    // 这一代的正文/思考：message.user 的分界标记把同一次尝试的 block 切给每一段。
    const allBlocks = live.live[turn.attemptId] ?? [];
    const allThinking = live.thinking[turn.attemptId] ?? [];
    const marks = attempt?.marks ?? [];
    const isLast = turn.generation >= marks.length;
    const start = turn.generation === 0 ? 0 : marks[turn.generation - 1]?.text ?? 0;
    const end = isLast ? undefined : marks[turn.generation]?.text;
    let blocks: readonly LiveBlock[] = allBlocks.slice(start, end);
    // 最后一轮的完整版是 agent_final：它只覆盖末轮，更早轮次（工具调用之间的话）原样保留。
    if (isLast && attempt?.finalText !== undefined) {
      const last = blocks[blocks.length - 1];
      blocks =
        last && attempt.finalText.startsWith(last.text)
          ? [...blocks.slice(0, -1), { id: last.id, text: attempt.finalText }]
          : [...blocks, { id: "final", text: attempt.finalText }];
    }
    const thinkStart = turn.generation === 0 ? 0 : marks[turn.generation - 1]?.thinking ?? 0;
    const thinkEnd = isLast ? undefined : marks[turn.generation]?.thinking;
    // 每一轮模型输出单独判断：前一轮说的话不会被后一轮的推理标签带走。
    const { thinking: tagged, answer } = joinSplits(blocks.map((block) => splitThinking(block.text)));
    // 模型从独立推理字段流出的（reasoning_content → agent.thinking_delta）排在前面；混进回复正文里的 <think> 段按轮接在后面。
    const streamed = allThinking.slice(thinkStart, thinkEnd ?? undefined);
    const thinking = [streamed.map((block) => block.text).filter((text) => text !== "").join("\n\n"), tagged]
      .filter((text) => text !== "")
      .join("\n\n");
    return {
      ...turn,
      status: isLast ? attempt?.status ?? turn.status : "completed",
      resumed: isLast ? attempt?.resumed ?? 0 : 0,
      failure: isLast ? attempt?.failure : undefined,
      text: answer,
      thinking,
      streaming: isLast && attempt?.finalText === undefined && blocks.some((block) => block.text !== ""),
      truncated: isLast && Boolean(live.truncated[turn.attemptId]),
    };
  });
}

const TOOL_TEXT: Readonly<Record<string, string>> = { TaskList: "查看任务计划" };

/** 工具名的中文说明；没收录的显示原名。 */
export const toolLabel = (tool: string) => TOOL_TEXT[tool] ?? tool;
