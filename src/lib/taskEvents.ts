import type { TaskEvent } from "./tasks";

export type AttemptStatus = "running" | "parked_approval" | "parked_input" | "completed" | "failed" | "cancelled";

export interface AttemptView {
  readonly attemptId: string;
  readonly nodeId: string;
  readonly attemptNo: number;
  readonly status: AttemptStatus;
  /** How many times the same attempt was picked up again (a worker crash, an approval, a user reply). */
  readonly resumed: number;
  readonly finalText?: string;
  /** The structured result of the attempt (attempt.finished `output`), when the runtime reports one. */
  readonly output?: Readonly<Record<string, unknown>>;
  /** The output was too large for the event (`output_truncated`): only a note is shown. */
  readonly outputTruncated?: boolean;
  /** Why the attempt failed (attempt.finished with outcome failed); absent for older events and for other outcomes. */
  readonly failure?: AttemptFailure;
  /** The profile (expert ref, `name@version`) the attempt runs as; absent in older events. */
  readonly profile?: string;
  /** Set when a profile switch took effect for this attempt: the profile the node ran as before. */
  readonly switchedFrom?: string;
  /**
   * 每次 message.user 到达时的分界：到这里为止，正文/思考各累计到第几个 block。
   * 会话据此把同一次尝试切成多段回复（你的每句话之间一段）。
   */
  readonly marks: readonly { readonly text: number; readonly thinking: number }[];
}

export type FailureClass = "transient" | "model" | "tool" | "policy" | "budget" | "verification" | "lost";

export interface AttemptFailure {
  /** A `FailureClass` from contract v3; kept as a string so a class added later still shows. */
  readonly failureClass: string;
  readonly message: string;
  readonly retryable: boolean;
}

/** The last node.status_changed seen for a node, with the reason the runtime gave (a retry's cause, why it is blocked). */
export interface NodeState {
  readonly status: string;
  readonly reason: string;
}

/** Limits or amounts of a budget; a field that is absent is not limited (or, for a grant, not changed). `cost_usd_micros` is micro-dollars. */
export interface BudgetAmounts {
  readonly tokens?: number;
  readonly tool_calls?: number;
  readonly wall_s?: number;
  readonly cost_usd_micros?: number;
}

/** The budget ran out: which scope, the node it concerns (if any) and what the runtime says is missing (may be empty). */
export interface BudgetHold {
  readonly scope: string;
  readonly nodeId: string;
  readonly detail: string;
}

/** The task waits for a person (PAUSED_NEEDS_REVIEW): why, and the plan change that was turned down just before, if any. */
export interface ReviewNotice {
  readonly reason: string;
  readonly rejection: { readonly code: string; readonly detail: string } | null;
  /** Set when the wait is for budget: a person can grant more. */
  readonly budget?: BudgetHold;
}

/** A node's profile was switched (profile.switched): it applies from the node's next attempt. */
export interface ProfileSwitch {
  readonly nodeId: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  /** Set when the switch waited for an approval. */
  readonly approvalId: string;
}

/** How an approval ended, from approval.decided. */
export type ApprovalOutcome = "APPROVED" | "REJECTED" | "CANCELLED" | "TAKEN_OVER";

export interface AgentQuestion {
  readonly attemptId: string;
  readonly text: string;
}

/** The text one model round has streamed so far. */
export interface LiveBlock {
  readonly id: string;
  readonly text: string;
}

export interface TaskLiveState {
  readonly attempts: readonly AttemptView[];
  readonly question: AgentQuestion | null;
  /** Streamed text per attempt that has not produced its final message yet, one block per model round. */
  readonly live: Readonly<Record<string, readonly LiveBlock[]>>;
  /** Streamed thinking per attempt (the model's reasoning field), one block per model round; ephemeral like `live`. */
  readonly thinking: Readonly<Record<string, readonly LiveBlock[]>>;
  /** Attempts whose live text may miss chunks because the stream dropped while they were writing. */
  readonly truncated: Readonly<Record<string, true>>;
  /** The highest `entity.version` applied per `kind:id`. Only events with a version above it are applied (09 §1). */
  readonly versions: Readonly<Record<string, number>>;
  /** Per node: its latest status and reason. Nodes that old events never mention are simply absent. */
  readonly nodes: Readonly<Record<string, NodeState>>;
  /** Set while the task waits for a person; cleared by the next status change that leaves PAUSED_NEEDS_REVIEW. */
  readonly review: ReviewNotice | null;
  /** A plan.change_rejected that no other durable event has followed yet: the next review notice takes it as its cause. */
  readonly rejection: { readonly code: string; readonly detail: string } | null;
  /** A budget.exhausted that the next review notice takes as its cause; dropped by the next status change, a grant or a new attempt. */
  readonly exhausted: BudgetHold | null;
  /** What each attempt that is still running holds back from the task's budget (attempt.started `budget_reserved`). */
  readonly reserved: Readonly<Record<string, BudgetAmounts>>;
  /** Every profile switch so far, oldest first. */
  readonly switches: readonly ProfileSwitch[];
  /** How each decided approval ended; a CANCELLED one belonged to an interrupted or cancelled attempt. */
  readonly approvals: Readonly<Record<string, ApprovalOutcome>>;
  /** 最近一次 attempt.* 事件对应的尝试：message.user（回答/追问）落在它身上。 */
  readonly lastAttemptId: string;
}

export const emptyLiveState: TaskLiveState = { attempts: [], question: null, live: {}, thinking: {}, truncated: {}, versions: {}, nodes: {}, review: null, rejection: null, exhausted: null, reserved: {}, switches: [], approvals: {}, lastAttemptId: "" };

const field = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  return typeof value === "string" ? value : "";
};

const withAttempt = (
  attempts: readonly AttemptView[],
  attemptId: string,
  change: (attempt: AttemptView) => AttemptView,
): readonly AttemptView[] => attempts.map((attempt) => (attempt.attemptId === attemptId ? change(attempt) : attempt));

const without = <T extends Record<string, unknown>>(record: T, key: string): T => {
  const { [key]: _removed, ...rest } = record;
  return rest as T;
};

/** A delta continues the block it belongs to; the first delta of another block starts a new one. */
function appendDelta(blocks: readonly LiveBlock[], id: string, text: string): readonly LiveBlock[] {
  const last = blocks[blocks.length - 1];
  return last !== undefined && last.id === id ? [...blocks.slice(0, -1), { id, text: last.text + text }] : [...blocks, { id, text }];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const finishedStatus = (outcome: string): AttemptStatus =>
  outcome === "completed" ? "completed" : outcome === "cancelled" ? "cancelled" : "failed";

const failureOf = (value: unknown): AttemptFailure | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  return { failureClass: field(raw, "failure_class"), message: field(raw, "message"), retryable: raw.retryable === true };
};

/** The amounts of a budget payload; a null or negative field is no amount (a null cost is unknown, never 0). */
export function budgetAmounts(value: unknown): BudgetAmounts {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const out: { -readonly [K in keyof BudgetAmounts]: number } = {};
  for (const key of ["tokens", "tool_calls", "wall_s", "cost_usd_micros"] as const) {
    const amount = raw[key];
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) out[key] = amount;
  }
  return out;
}

/** What the attempts that are running hold together. */
export function totalReserved(state: TaskLiveState): BudgetAmounts {
  const total: { -readonly [K in keyof BudgetAmounts]: number } = {};
  for (const held of Object.values(state.reserved)) {
    for (const key of ["tokens", "tool_calls", "wall_s", "cost_usd_micros"] as const) {
      const amount = held[key];
      if (amount !== undefined) total[key] = (total[key] ?? 0) + amount;
    }
  }
  return total;
}

/** The node an attempt spent its budget on and is still blocked by, when no budget.exhausted event says so (an attempt that ran out). */
function blockedByBudget(state: TaskLiveState): BudgetHold | null {
  const seen = new Set<string>();
  for (let i = state.attempts.length - 1; i >= 0; i -= 1) {
    const attempt = state.attempts[i];
    // Only a node's latest attempt tells why it is blocked now.
    if (seen.has(attempt.nodeId)) continue;
    seen.add(attempt.nodeId);
    if (attempt.failure?.failureClass === "budget" && state.nodes[attempt.nodeId]?.status === "BLOCKED") {
      return { scope: "node", nodeId: attempt.nodeId, detail: attempt.failure.message };
    }
  }
  return null;
}

/**
 * The switch of a node that no attempt has run as yet: it takes effect from the node's next attempt, and the person
 * should be told so. Null when the node was never switched or its latest attempt already runs as the new profile.
 */
export function pendingSwitch(state: TaskLiveState, nodeId: string): ProfileSwitch | null {
  const latest = [...state.switches].reverse().find((item) => item.nodeId === nodeId);
  if (!latest) return null;
  const attempt = [...state.attempts].reverse().find((item) => item.nodeId === nodeId);
  return attempt?.profile === latest.to ? null : latest;
}

const APPROVAL_OUTCOMES: readonly string[] = ["APPROVED", "REJECTED", "CANCELLED", "TAKEN_OVER"];

function applyChange(state: TaskLiveState, event: TaskEvent): TaskLiveState {
  // A rejected plan change is only the cause of a review that comes right after it: any other durable event ends that.
  if (state.rejection && event.seq > 0 && event.type !== "plan.change_rejected" && event.type !== "task.status_changed") {
    return applyChange({ ...state, rejection: null }, event);
  }
  const payload = event.payload;
  const attemptId = field(payload, "attempt_id");
  switch (event.type) {
    case "attempt.started":
      return {
        ...state,
        lastAttemptId: attemptId,
        attempts: [
          ...state.attempts,
          {
            attemptId,
            nodeId: field(payload, "node_id"),
            attemptNo: Number(payload.attempt_no ?? 1),
            status: "running",
            resumed: 0,
            marks: [],
            ...(field(payload, "profile") ? { profile: field(payload, "profile") } : {}),
            ...(field(payload, "switched_from") ? { switchedFrom: field(payload, "switched_from") } : {}),
          },
        ],
        exhausted: null,
        reserved: Object.keys(budgetAmounts(payload.budget_reserved)).length > 0 ? { ...state.reserved, [attemptId]: budgetAmounts(payload.budget_reserved) } : state.reserved,
      };
    case "attempt.parked": {
      const isInput = payload.reason === "input";
      return {
        ...state,
        lastAttemptId: attemptId,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: isInput ? "parked_input" : "parked_approval" })),
        question: isInput ? { attemptId, text: field(payload, "question") } : state.question,
      };
    }
    case "attempt.resumed":
      return {
        ...state,
        lastAttemptId: attemptId,
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: "running", resumed: a.resumed + 1 })),
        question: state.question?.attemptId === attemptId ? null : state.question,
      };
    case "attempt.finished":
      return {
        ...state,
        lastAttemptId: attemptId,
        // live 保留：会话按 message.user 的分界取历史 block，final 之后的重放/渲染还要用。
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, status: finishedStatus(field(payload, "outcome")), failure: failureOf(payload.failure), ...(isRecord(payload.output) && Object.keys(payload.output).length > 0 ? { output: payload.output } : {}), ...(payload.output_truncated === true ? { outputTruncated: true } : {}) })),
        question: state.question?.attemptId === attemptId ? null : state.question,
        truncated: without(state.truncated, attemptId),
        reserved: without(state.reserved, attemptId),
      };
    case "agent.token_delta":
      return { ...state, live: { ...state.live, [attemptId]: appendDelta(state.live[attemptId] ?? [], field(payload, "block_id"), field(payload, "text")) } };
    case "agent.thinking_delta":
      return { ...state, thinking: { ...state.thinking, [attemptId]: appendDelta(state.thinking[attemptId] ?? [], field(payload, "block_id"), field(payload, "text")) } };
    case "message.agent_final":
      return {
        ...state,
        // live 保留：最终消息只是最后一轮的完整版，更早的轮次（工具调用之间的话）只在 blocks 里。
        attempts: withAttempt(state.attempts, attemptId, (a) => ({ ...a, finalText: field(payload, "text") })),
        truncated: without(state.truncated, attemptId),
      };
    case "message.user": {
      // 一条用户消息是一次尝试的输出分界——只对还在进行的尝试：
      // 已结束的尝试不拆，回答它的新尝试由 attempt.started 自己另起一段。
      const target = state.lastAttemptId;
      const attempt = state.attempts.find((a) => a.attemptId === target);
      if (!attempt) return state;
      if (attempt.status !== "running" && !attempt.status.startsWith("parked")) return state;
      const mark = { text: state.live[target]?.length ?? 0, thinking: state.thinking[target]?.length ?? 0 };
      return { ...state, attempts: withAttempt(state.attempts, target, (a) => ({ ...a, marks: [...a.marks, mark] })) };
    }
    case "node.status_changed": {
      const nodeId = field(payload, "node_id");
      if (nodeId === "") return state;
      return { ...state, nodes: { ...state.nodes, [nodeId]: { status: field(payload, "to_status"), reason: field(payload, "reason") } } };
    }
    case "task.status_changed": {
      if (payload.to_status !== "PAUSED_NEEDS_REVIEW") return { ...state, review: null, rejection: null, exhausted: null };
      const budget = state.exhausted ?? blockedByBudget(state);
      return { ...state, review: { reason: field(payload, "reason"), rejection: state.rejection, ...(budget ? { budget } : {}) }, rejection: null, exhausted: null };
    }
    case "budget.exhausted":
      return { ...state, exhausted: { scope: field(payload, "scope"), nodeId: field(payload, "node_id"), detail: field(payload, "detail") } };
    case "budget.granted":
      return { ...state, exhausted: null };
    case "profile.switched": {
      const nodeId = field(payload, "node_id");
      if (nodeId === "") return state;
      return { ...state, switches: [...state.switches, { nodeId, from: field(payload, "from_profile"), to: field(payload, "to_profile"), reason: field(payload, "reason"), approvalId: field(payload, "approval_id") }] };
    }
    case "plan.change_rejected":
      return { ...state, rejection: { code: field(payload, "code"), detail: field(payload, "detail") } };
    case "approval.decided": {
      const status = field(payload, "status");
      const approvalId = field(payload, "approval_id");
      if (approvalId === "" || !APPROVAL_OUTCOMES.includes(status)) return state;
      return { ...state, approvals: { ...state.approvals, [approvalId]: status as ApprovalOutcome } };
    }
    default:
      return state;
  }
}

/**
 * Folds one event into the state. Per entity an event with an older `entity.version` than the one already applied is
 * ignored, so a late older event cannot turn the state back (09 §1). An equal version is applied: control stamps an
 * unversioned worker event (a worker's `attempt.resumed`, version 0) with the entity's current version, and a
 * duplicate delivery is removed by `mergeEvent` (same event_id or seq), not here. Version 0, and an event with no
 * entity, are always applied and do not move the mark.
 */
export function applyEvent(state: TaskLiveState, event: TaskEvent): TaskLiveState {
  const version = event.entity?.version ?? 0;
  if (!event.entity || version <= 0) return applyChange(state, event);
  const key = `${event.entity.kind}:${event.entity.id}`;
  if (version < (state.versions[key] ?? 0)) return state;
  const next = applyChange(state, event);
  return { ...next, versions: { ...next.versions, [key]: version } };
}

/** The stream dropped: text or thinking streamed so far may be missing chunks until the attempt's final message arrives. */
export function markStreamGap(state: TaskLiveState): TaskLiveState {
  const finished = new Set(state.attempts.filter((a) => a.status !== "running" && !a.status.startsWith("parked")).map((a) => a.attemptId));
  const streaming = [...new Set([
    ...Object.keys(state.live).filter((id) => !finished.has(id) && state.live[id].some((block) => block.text !== "")),
    ...Object.keys(state.thinking).filter((id) => !finished.has(id) && state.thinking[id].some((block) => block.text !== "")),
  ])];
  if (streaming.length === 0) return state;
  return { ...state, truncated: { ...state.truncated, ...Object.fromEntries(streaming.map((id) => [id, true as const])) } };
}

/** Where an event sits in the stream: a durable event at its seq, an ephemeral one right after the durable event it follows. */
const position = (event: TaskEvent): number => (event.seq > 0 ? event.seq * 2 : (event.after_seq ?? 0) * 2 + 1);

/**
 * Adds an event to the log once, in stream order. Replays after a reconnect are therefore harmless, and state built
 * by folding the log is the same whichever order the frames arrived in (09 §1).
 */
export function mergeEvent(events: readonly TaskEvent[], event: TaskEvent): readonly TaskEvent[] {
  if (events.some((item) => item.event_id === event.event_id || (event.seq > 0 && item.seq === event.seq))) return events;
  return [...events, event].sort((a, b) => position(a) - position(b));
}
