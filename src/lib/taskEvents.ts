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

/** The leader's reviews reached `Policy.max_review_rounds` (plan.review_limit_reached): the last round's tasks are done and were not reviewed. */
export interface ReviewLimit {
  readonly nodeId: string;
  readonly round: number;
  readonly maxRounds: number;
  /** How many tasks the last round created. */
  readonly children: number;
}

/** The task waits for a person (PAUSED_NEEDS_REVIEW): why, and the plan change that was turned down just before, if any. */
export interface ReviewNotice {
  readonly reason: string;
  readonly rejection: { readonly code: string; readonly detail: string } | null;
  /** Set when the wait is for budget: a person can grant more. */
  readonly budget?: BudgetHold;
  /** Set when the wait is for the review cap: the leader would have reviewed once more. */
  readonly limit?: ReviewLimit;
}

/** The usage of a turn or a round, as the contract reports it (`tokens_in`, `tokens_out`, `tool_calls`, `wall_s`, `cost_usd_micros`). */
export type UsageRecord = Readonly<Record<string, unknown>>;

/** One turn a member took in a team stage: what the leader asked of a role, and how it ended. */
export interface TeamTurnView {
  readonly round: number;
  readonly role: string;
  /** What a person called the role (beside `role` in the event); empty for a team from before labels. */
  readonly label: string;
  /** The member's expert (profile ref). */
  readonly executor: string;
  readonly memberAttemptId: string;
  readonly task: string;
  readonly outcome: "running" | "completed" | "failed";
  readonly summary: string;
  readonly usage?: UsageRecord;
  readonly artifacts: readonly string[];
}

/** One turn of the stage's leader. */
export interface TeamRoundView {
  readonly round: number;
  readonly outcome: "running" | "assigned" | "completed" | "stopped";
  readonly assignments: number;
  /** Why the stage stopped (outcome `stopped`). */
  readonly reason: string;
  readonly usage?: UsageRecord;
}

/** A note a member or the leader posted for the team (team.message). */
export interface TeamNote {
  readonly seq: number;
  readonly role: string;
  readonly label: string;
  readonly text: string;
}

/** One team stage's attempt: the leader's rounds, the members' turns and the mailbox, from the stage's `team.*` events. */
export interface TeamStageView {
  readonly attemptId: string;
  readonly nodeId: string;
  /** The round the leader is in (or was in when the stage ended). */
  readonly round: number;
  readonly maxRounds: number;
  /** The stage's limits and how many messages it has used, as team.round_* report them; absent in events from before they were sent. */
  readonly maxMessages?: number;
  readonly maxMembers?: number;
  /** How long a chain of @-wakes may get inside one round. */
  readonly maxHops?: number;
  readonly messages?: number;
  readonly rounds: readonly TeamRoundView[];
  readonly turns: readonly TeamTurnView[];
  readonly notes: readonly TeamNote[];
}

/** What counts against a stage's `max_messages`: every assignment, every result and every note (the events say it too, when they do). */
export const teamMessageCount = (stage: TeamStageView): number => stage.messages ?? stage.notes.length;

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

/** One structured question of ask_user: a short chip label, the question and its options. */
export interface AskQuestion {
  readonly header: string;
  readonly question: string;
  readonly options: readonly { readonly label: string; readonly description?: string }[];
  readonly multiSelect: boolean;
}

export interface AgentQuestion {
  readonly attemptId: string;
  readonly text: string;
  /** Present when the agent asked with options; `text` is always the plain-text version. */
  readonly questions?: readonly AskQuestion[];
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
  /** Team stages by the stage's attempt id, oldest first (a retried stage has one entry per attempt). */
  readonly teams: Readonly<Record<string, TeamStageView>>;
  /** A plan.review_limit_reached that the next review notice takes as its cause; dropped by the next status change. */
  readonly reviewLimit: ReviewLimit | null;
}

export const emptyLiveState: TaskLiveState = { attempts: [], question: null, live: {}, thinking: {}, truncated: {}, versions: {}, nodes: {}, review: null, rejection: null, exhausted: null, reserved: {}, switches: [], approvals: {}, lastAttemptId: "", teams: {}, reviewLimit: null };

/** The newest team stage of a node (its latest attempt), or undefined when the node never ran one. */
export function stageOfNode(state: TaskLiveState, nodeId: string): TeamStageView | undefined {
  return Object.values(state.teams).filter((stage) => stage.nodeId === nodeId).at(-1);
}

const field = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  return typeof value === "string" ? value : "";
};

/** The questions of an attempt.parked payload; a malformed entry is ignored. */
function askQuestions(value: unknown): readonly AskQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: AskQuestion[] = [];
  for (const item of value.slice(0, 4)) {
    if (!isRecord(item)) continue;
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const options = (Array.isArray(item.options) ? item.options : []).flatMap((option) => {
      if (!isRecord(option) || typeof option.label !== "string" || !option.label.trim()) return [];
      return [{ label: option.label, ...(typeof option.description === "string" && option.description ? { description: option.description } : {}) }];
    });
    if (!question || options.length === 0) continue;
    out.push({ header: typeof item.header === "string" ? item.header : "", question, options, multiSelect: item.multi_select === true });
  }
  return out;
}

function agentQuestion(attemptId: string, payload: Record<string, unknown>): AgentQuestion {
  const questions = askQuestions(payload.questions);
  return { attemptId, text: field(payload, "question"), ...(questions.length > 0 ? { questions } : {}) };
}

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

const count = (payload: Record<string, unknown>, key: string): number => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const usageOf = (value: unknown): UsageRecord | undefined => (isRecord(value) ? value : undefined);

/** Applies `change` to the stage of the event's attempt, creating it when this is the first event the page sees of it. */
function withStage(state: TaskLiveState, payload: Record<string, unknown>, change: (stage: TeamStageView) => TeamStageView): TaskLiveState {
  const attemptId = field(payload, "attempt_id");
  if (attemptId === "") return state;
  const current = state.teams[attemptId] ?? { attemptId, nodeId: field(payload, "node_id"), round: 0, maxRounds: 0, rounds: [], turns: [], notes: [] };
  return { ...state, teams: { ...state.teams, [attemptId]: change(current) } };
}

/** max_messages, max_members and messages of a team.round_started, when it has them. */
const limitsOf = (payload: Record<string, unknown>, stage: TeamStageView) => ({
  ...(count(payload, "max_messages") > 0 ? { maxMessages: count(payload, "max_messages") } : stage.maxMessages ? { maxMessages: stage.maxMessages } : {}),
  ...(typeof payload.max_hops === "number" ? { maxHops: count(payload, "max_hops") } : stage.maxHops !== undefined ? { maxHops: stage.maxHops } : {}),
  ...(count(payload, "max_members") > 0 ? { maxMembers: count(payload, "max_members") } : stage.maxMembers ? { maxMembers: stage.maxMembers } : {}),
  ...(typeof payload.messages === "number" ? { messages: count(payload, "messages") } : stage.messages !== undefined ? { messages: stage.messages } : {}),
});

const upsertRound = (rounds: readonly TeamRoundView[], round: TeamRoundView): readonly TeamRoundView[] =>
  rounds.some((item) => item.round === round.round) ? rounds.map((item) => (item.round === round.round ? { ...item, ...round } : item)) : [...rounds, round].sort((a, b) => a.round - b.round);

const stageSeq = (state: TaskLiveState, payload: Record<string, unknown>): number => (state.teams[field(payload, "attempt_id")]?.notes.length ?? 0) + 1;

function foldTeam(state: TaskLiveState, event: TaskEvent): TaskLiveState {
  const payload = event.payload;
  const round = count(payload, "round");
  switch (event.type) {
    case "team.round_started":
      return withStage(state, payload, (stage) => ({
        ...stage,
        round,
        maxRounds: count(payload, "max_rounds") || stage.maxRounds,
        ...limitsOf(payload, stage),
        rounds: upsertRound(stage.rounds, { round, outcome: "running", assignments: 0, reason: "" }),
      }));
    case "team.round_finished": {
      const outcome = field(payload, "outcome");
      return withStage(state, payload, (stage) => ({
        ...stage,
        round: Math.max(stage.round, round),
        ...(typeof payload.messages === "number" ? { messages: count(payload, "messages") } : {}),
        rounds: upsertRound(stage.rounds, {
          round,
          outcome: outcome === "assigned" || outcome === "completed" || outcome === "stopped" ? outcome : "completed",
          assignments: count(payload, "assignments"),
          reason: field(payload, "reason"),
          usage: usageOf(payload.usage),
        }),
      }));
    }
    case "team.member_turn_started":
      return withStage(state, payload, (stage) => ({
        ...stage,
        turns: [...stage.turns, { round, role: field(payload, "role"), label: field(payload, "label"), executor: field(payload, "executor"), memberAttemptId: field(payload, "member_attempt_id"), task: field(payload, "task"), outcome: "running", summary: "", artifacts: [] }],
      }));
    case "team.member_turn_finished": {
      const memberAttemptId = field(payload, "member_attempt_id");
      const outcome = field(payload, "outcome") === "failed" ? "failed" : "completed";
      return withStage(state, payload, (stage) => {
        // The turn that is still open for this member attempt; one that was never seen start (a page that joined late) is added.
        const index = stage.turns.findIndex((turn) => turn.memberAttemptId === memberAttemptId && turn.outcome === "running");
        const finished: TeamTurnView = {
          round,
          role: field(payload, "role"),
          label: field(payload, "label"),
          executor: field(payload, "executor"),
          memberAttemptId,
          task: index >= 0 ? stage.turns[index].task : "",
          outcome,
          summary: field(payload, "summary"),
          usage: usageOf(payload.usage),
          artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.filter((name): name is string => typeof name === "string") : [],
        };
        return { ...stage, turns: index >= 0 ? stage.turns.map((turn, i) => (i === index ? finished : turn)) : [...stage.turns, finished] };
      });
    }
    case "team.message": {
      // Plan-level messages (round 0) belong to no stage: the chat shows them, a stage's own view does not take them.
      if (count(payload, "round") === 0) return state;
      const seq = payload.seq == null ? stageSeq(state, payload) : count(payload, "seq");
      return withStage(state, payload, (stage) =>
        stage.notes.some((note) => note.seq === seq) ? stage : { ...stage, ...(stage.messages !== undefined ? { messages: stage.messages + 1 } : {}), notes: [...stage.notes, { seq, role: field(payload, "from_role") || field(payload, "role"), label: field(payload, "from_label") || field(payload, "label"), text: field(payload, "text") }].sort((a, b) => a.seq - b.seq) },
      );
    }
    default:
      return state;
  }
}

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
        question: isInput ? agentQuestion(attemptId, payload) : state.question,
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
      if (payload.to_status !== "PAUSED_NEEDS_REVIEW") return { ...state, review: null, rejection: null, exhausted: null, reviewLimit: null };
      const budget = state.exhausted ?? blockedByBudget(state);
      return { ...state, review: { reason: field(payload, "reason"), rejection: state.rejection, ...(budget ? { budget } : {}), ...(state.reviewLimit ? { limit: state.reviewLimit } : {}) }, rejection: null, exhausted: null, reviewLimit: null };
    }
    case "plan.review_limit_reached":
      return { ...state, reviewLimit: { nodeId: field(payload, "node_id"), round: count(payload, "round"), maxRounds: count(payload, "max_rounds"), children: count(payload, "children") } };
    case "team.round_started":
    case "team.round_finished":
    case "team.member_turn_started":
    case "team.member_turn_finished":
    case "team.message":
      return foldTeam(state, event);
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
export const eventPosition = (event: TaskEvent): number => (event.seq > 0 ? event.seq * 2 : (event.after_seq ?? 0) * 2 + 1);

/**
 * Adds an event to the log once, in stream order. Replays after a reconnect are therefore harmless, and state built
 * by folding the log is the same whichever order the frames arrived in (09 §1).
 */
export function mergeEvent(events: readonly TaskEvent[], event: TaskEvent): readonly TaskEvent[] {
  if (events.some((item) => item.event_id === event.event_id || (event.seq > 0 && item.seq === event.seq))) return events;
  return [...events, event].sort((a, b) => eventPosition(a) - eventPosition(b));
}
