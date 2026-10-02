import type { AttemptStatus, TaskLiveState } from "./taskEvents";
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
  readonly at: string;
}

export type Turn = UserTurn | AgentTurn;

const str = (payload: Record<string, unknown>, key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");

function updateAgent(turns: readonly Turn[], attemptId: string, change: (turn: AgentTurn) => AgentTurn): readonly Turn[] {
  return turns.map((turn) => (turn.kind === "agent" && turn.id === attemptId ? change(turn) : turn));
}

function upsertStep(steps: readonly Step[], step: Step): readonly Step[] {
  return steps.some((item) => item.id === step.id) ? steps.map((item) => (item.id === step.id ? { ...item, ...step } : item)) : [...steps, step];
}

function fold(turns: readonly Turn[], event: TaskEvent): readonly Turn[] {
  const payload = event.payload;
  switch (event.type) {
    case "task.created":
      return [...turns, { kind: "user", id: event.event_id, text: str(payload, "goal"), at: event.occurred_at, interrupt: false }];
    case "message.user":
      return [...turns, { kind: "user", id: event.event_id, text: str(payload, "text"), at: event.occurred_at, interrupt: payload.delivery === "interrupt" }];
    case "attempt.started":
      return [
        ...turns,
        {
          kind: "agent",
          id: str(payload, "attempt_id"),
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
    default:
      return turns;
  }
}

/**
 * 把任务事件整理成对话：你说的话是一条，每次尝试是一条 Agent 回复，
 * 回复里带着它执行过的步骤（工具调用）。文字和状态取自已折叠的实时状态，事件重放后结果一样。
 */
export function buildTimeline(task: Task, events: readonly TaskEvent[], live: TaskLiveState): readonly Turn[] {
  const folded = events.reduce(fold, [] as readonly Turn[]);
  const withGoal: readonly Turn[] = folded.some((turn) => turn.kind === "user")
    ? folded
    : [{ kind: "user", id: `goal-${task.task_id}`, text: task.goal, at: task.created_at, interrupt: false }, ...folded];
  return withGoal.map((turn) => {
    if (turn.kind !== "agent") return turn;
    const attempt = live.attempts.find((item) => item.attemptId === turn.id);
    const blocks = live.live[turn.id] ?? [];
    // 每一轮模型输出单独判断：前一轮说的话不会被后一轮的推理标签带走。
    const { thinking, answer } =
      attempt?.finalText !== undefined ? joinSplits([splitThinking(attempt.finalText)]) : joinSplits(blocks.map((block) => splitThinking(block.text)));
    return {
      ...turn,
      status: attempt?.status ?? turn.status,
      resumed: attempt?.resumed ?? 0,
      text: answer,
      thinking,
      streaming: attempt?.finalText === undefined && blocks.some((block) => block.text !== ""),
      truncated: Boolean(live.truncated[turn.id]),
    };
  });
}

const TOOL_TEXT: Readonly<Record<string, string>> = { TaskList: "查看任务计划" };

/** 工具名的中文说明；没收录的显示原名。 */
export const toolLabel = (tool: string) => TOOL_TEXT[tool] ?? tool;
