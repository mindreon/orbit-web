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

/** One piece of what an agent did in a reply, in the order it happened: words of a model round, or a tool call. */
export type Segment =
  | { readonly kind: "text"; readonly id: string; readonly text: string }
  | { readonly kind: "step"; readonly step: Step };

/** What an attempt used up (attempt.finished `usage`); only the numbers the contract reports. */
export interface TurnUsage {
  readonly tokensIn: number;
  readonly tokensOut: number;
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
  /**
   * 这一段回复里先后发生的事：每一轮模型的话和这一轮的工具调用，按事件流里出现的先后排。
   * 最终回复不在里面（它在 `answer`，永远排在最后）；开头之后的步骤也在这里，所以 `steps` 是它的子集。
   */
  readonly segments: readonly Segment[];
  /** 最终回复：最后一轮模型的话，只要它后面没有再跟工具调用（有 agent_final 时一定是它）。没有时为空。 */
  readonly answer: string;
  /**
   * 事件流里每个 block / 步骤第一次出现的顺序：`t:<block_id>`、`s:<step id>`。文字和工具事件
   * 在流里的先后就是它们发生的先后，`segments` 据此排序。只在折叠事件时用。
   */
  readonly order: readonly string[];
  /** 全部几轮模型的话连在一起（含工具调用之间的话和最终回复；模型写进回复里的推理已经拆出去）。 */
  readonly text: string;
  /** 模型写进回复里的推理，折叠显示。 */
  readonly thinking: string;
  readonly streaming: boolean;
  readonly truncated: boolean;
  readonly resumed: number;
  /** 失败时的原因分类（已失败的那段回复才有）。 */
  readonly failure?: AttemptFailure;
  /** 这段回复开始的时间：尝试开始，或者你的上一条消息到达。 */
  readonly at: string;
  /** 这段回复结束的时间：尝试结束，或者你的下一条消息把它截断；还没结束时没有。 */
  readonly finishedAt?: string;
  /** 这次尝试的用量，挂在它的最后一段回复上；事件里没有（或全是 0）时没有。 */
  readonly usage?: TurnUsage;
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

/** 同一个调用的 started / finished 合成一步；结束事件里常常没有入参（只有 TodoWrite 带），已有的入参不被空的盖掉。 */
function upsertStep(steps: readonly Step[], step: Step): readonly Step[] {
  return steps.some((item) => item.id === step.id) ? steps.map((item) => (item.id === step.id ? { ...item, ...step, args: step.args || item.args } : item)) : [...steps, step];
}

/** 把 block / 步骤第一次出现的位置记下来（已记过的不动）。 */
const noted = (order: readonly string[], key: string): readonly string[] => (order.includes(key) ? order : [...order, key]);

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** 契约里的用量里的输入/输出 token；两个都是 0 说明没有记（默认值），不当成用量。 */
function usageOf(value: unknown): TurnUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const usage = { tokensIn: count(raw.tokens_in), tokensOut: count(raw.tokens_out) };
  return usage.tokensIn + usage.tokensOut > 0 ? usage : undefined;
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
        finishedAt: event.occurred_at,
        steps: target.steps.map((step) =>
          step.tool === "ask_user" && step.state === "running" ? { ...step, state: "success", result: `用户回答：${text}` } : step,
        ),
      };
      const next: AgentTurn = {
        ...target,
        id: `${target.attemptId}#${target.generation + 1}`,
        generation: target.generation + 1,
        steps: [],
        segments: [],
        answer: "",
        order: [],
        finishedAt: undefined,
        usage: undefined,
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
          segments: [],
          answer: "",
          order: [],
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
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({ ...turn, steps: upsertStep(turn.steps, step), order: noted(turn.order, `s:${step.id}`) }));
    }
    case "agent.token_delta": {
      // 文字本身取自折叠好的实时状态；这里只记下每个 block 第一次出现在事件流里的位置。
      const key = `t:${str(payload, "block_id")}`;
      const index = lastAgentIndexOf(turns, str(payload, "attempt_id"));
      const turn = turns[index];
      return turn?.kind === "agent" && !turn.order.includes(key) ? updateAgent(turns, turn.attemptId, (item) => ({ ...item, order: [...item.order, key] })) : turns;
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
      const usage = usageOf(payload.usage);
      return updateAgent(turns, str(payload, "attempt_id"), (turn) => ({ ...turn, status, finishedAt: event.occurred_at, ...(usage ? { usage } : {}) }));
    }
    default:
      return turns;
  }
}

/**
 * 一段回复里先后发生的事：每个 block 的正文（拆掉推理标签）和每个工具调用，按 `order`（事件流里第一次出现的先后）排。
 * 排不出位置的 block（事件流里没有它的增量，比如刷新后只剩 agent_final）排在所有步骤前面，不去猜。
 * 最终回复拿出来单独放：有 agent_final 时是最后一个 block（回放时它没有位置）；没有时是排在最后的那段话，只要它后面没有再跟工具调用。
 */
export function arrange(turn: Pick<AgentTurn, "order" | "steps">, blocks: readonly LiveBlock[], hasFinal: boolean): { readonly segments: readonly Segment[]; readonly answer: string } {
  const parts = blocks.map((block) => ({ id: block.id, text: splitThinking(block.text).answer.trim() }));
  const closing = hasFinal ? parts[parts.length - 1] : undefined;
  const placed: { pos: number; segment: Segment }[] = [];
  parts.forEach((part, index) => {
    if (part === closing || part.text === "") return;
    const at = turn.order.indexOf(`t:${part.id}`);
    placed.push({ pos: at >= 0 ? at : -1 + index / 1000, segment: { kind: "text", id: part.id, text: part.text } });
  });
  for (const step of turn.steps) placed.push({ pos: turn.order.indexOf(`s:${step.id}`), segment: { kind: "step", step } });
  placed.sort((a, b) => a.pos - b.pos);
  const segments = placed.map((item) => item.segment);
  if (closing) return { segments, answer: closing.text };
  const last = segments[segments.length - 1];
  return last?.kind === "text" ? { segments: segments.slice(0, -1), answer: last.text } : { segments, answer: "" };
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
    const { segments, answer: finalAnswer } = arrange(turn, blocks, isLast && attempt?.finalText !== undefined);
    return {
      ...turn,
      status: isLast ? attempt?.status ?? turn.status : "completed",
      resumed: isLast ? attempt?.resumed ?? 0 : 0,
      failure: isLast ? attempt?.failure : undefined,
      // 用量是整次尝试的，只挂在它的最后一段回复上。
      usage: isLast ? turn.usage : undefined,
      segments,
      answer: finalAnswer,
      text: answer,
      thinking,
      streaming: isLast && attempt?.finalText === undefined && finalAnswer !== "",
      truncated: isLast && Boolean(live.truncated[turn.attemptId]),
    };
  });
}
