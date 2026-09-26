import { readFailure, type ActivityEvent, type TurnErrorCode } from "./activity";
import type { Draft } from "./stream";

/** The four states a tool row shows. */
export type ToolRunState = "running" | "success" | "failed" | "rejected";

export interface ToolCallView {
  key: string;
  callId: string;
  turnId: string;
  sequence: number;
  toolName: string;
  argsPreview: string;
  resultText: string;
  /** tool.result says its text was capped at 4KB. */
  truncated: boolean;
  state: ToolRunState;
  /** Why a call failed or was rejected, in business language. Empty for running and success. */
  note: string;
  errorCode: string | null;
  agentPath: string;
  startedAt: string;
  finishedAt: string;
}

export interface ApprovalCardView {
  kind: "approval";
  id: string;
  /** One card per call: callId, else the runtime's approvalRequestId, else control's approvalId. */
  key: string;
  sequence: number;
  /** The user stopped the turn before deciding; the ask is void. */
  stopped: boolean;
  callId: string;
  approvalId: string;
  approvalRequestId: string;
  toolName: string;
  argsPreview: string;
  reason: string;
  risk: string;
  agentPath: string;
  /** From approval.resolved: "allowed-once", "rejected", ... Null while undecided as far as events tell. */
  outcome: string | null;
  decidedBy: string;
}

export interface QuestionCardView {
  kind: "question";
  id: string;
  questionId: string;
  text: string;
  choices: { id: string; label: string }[];
  allowCustom: boolean;
  agentPath: string;
  answer: { choiceIds: string[]; text: string } | null;
}

export type TimelineItem =
  | { kind: "user"; id: string; text: string; turnId: string; steered: boolean }
  | { kind: "assistant"; id: string; text: string; turnId: string; agentId: string; agentPath: string }
  | { kind: "tools"; id: string; turnId: string; calls: ToolCallView[] }
  | ApprovalCardView
  | QuestionCardView
  | { kind: "failure"; id: string; turnId: string; errorCode: TurnErrorCode; retryable: boolean; retryText: string | null }
  | { kind: "draft"; id: string; text: string; turnId: string; agentId: string; agentPath: string };

/**
 * A draft and the final message of the same block share one id, so the list keeps the same row (and its measured
 * height and rendered blocks) when the final text replaces the draft.
 */
export function blockItemId(turnId: string, blockId: string) {
  return `block:${turnId}:${blockId}`;
}

export type ProcessItem = { kind: "tool"; id: string; call: ToolCallView } | { kind: "event"; id: string; event: ActivityEvent };

const TOOL_ERROR_NOTES: Record<string, string> = {
  APPROVAL_REJECTED: "你拒绝了这一步，助手没有执行它。",
  PERMISSION_DENIED: "这件任务的权限不允许这一步。",
  DELEGATION_LIMIT_EXCEEDED: "子助手数量或层级超过了上限。",
  QUESTION_CANCELLED: "提问已取消。",
  SESSION_ABORTED: "任务已停止，这一步没有完成。",
};

const REJECTING_CODES = new Set(["APPROVAL_REJECTED", "PERMISSION_DENIED"]);

function agentPathOf(event: ActivityEvent) {
  return event.agentPath || event.agentId || "main";
}

function toolFromCall(event: ActivityEvent): ToolCallView {
  return {
    key: event.callId || event.id,
    callId: event.callId ?? "",
    turnId: event.turnId ?? "",
    sequence: event.sequence,
    toolName: event.toolName ?? "",
    argsPreview: event.argsPreview ?? "",
    resultText: "",
    truncated: false,
    state: "running",
    note: "",
    errorCode: null,
    agentPath: agentPathOf(event),
    startedAt: event.occurredAt ?? "",
    finishedAt: "",
  };
}

function applyResult(call: ToolCallView, event: ActivityEvent) {
  const code = event.errorCode ?? null;
  const toolState = event.toolState ?? (code ? "error" : "success");
  call.errorCode = code;
  call.resultText = event.text ?? "";
  call.truncated = event.truncated === true;
  call.finishedAt = event.occurredAt ?? "";
  if (!call.toolName) call.toolName = event.toolName ?? "";
  if (!call.argsPreview) call.argsPreview = event.argsPreview ?? "";
  if (toolState === "success") {
    call.state = "success";
    call.note = "";
  } else if (toolState === "denied" || (code && REJECTING_CODES.has(code))) {
    call.state = "rejected";
    call.note = (code && TOOL_ERROR_NOTES[code]) || "这一步被拒绝，没有执行。";
  } else {
    call.state = "failed";
    call.note = (code && TOOL_ERROR_NOTES[code]) || (toolState === "interrupted" ? "这一步被中断了。" : "这一步没有成功。");
  }
}

/**
 * Events after which a tool call that still has no result will never get one: the turn failed, or a new turn began.
 * An assistant message does not end a call: the runtime also posts one while the call waits for an approval.
 */
function endsOpenCalls(event: ActivityEvent) {
  return event.type === "turn.failed" || event.type === "room.steered" || (event.type === "assistant.message" && event.role === "user");
}

/** Pairs tool.call with tool.result by callId. A result whose call fell out of history still gets a row. */
class ToolPairing {
  private byCall = new Map<string, ToolCallView>();
  private running = new Set<ToolCallView>();

  call(event: ActivityEvent) {
    const view = toolFromCall(event);
    if (view.callId) this.byCall.set(view.callId, view);
    this.running.add(view);
    return view;
  }

  /** Calls still running when their turn is over will not get a result any more. */
  settle(event: ActivityEvent) {
    if (!endsOpenCalls(event)) return;
    this.close("没有收到这一步的结果。");
  }

  close(note: string, upTo = Number.POSITIVE_INFINITY) {
    for (const view of this.running) {
      if (view.state !== "running" || view.sequence > upTo) continue;
      view.state = "failed";
      view.note = note;
      this.running.delete(view);
    }
  }

  result(event: ActivityEvent): { view: ToolCallView; isNew: boolean } {
    const existing = event.callId ? this.byCall.get(event.callId) : undefined;
    if (existing) {
      applyResult(existing, event);
      this.running.delete(existing);
      return { view: existing, isNew: false };
    }
    const view = toolFromCall(event);
    applyResult(view, event);
    if (view.callId) this.byCall.set(view.callId, view);
    return { view, isNew: true };
  }
}

function approvalKey(event: ActivityEvent) {
  return event.callId || event.approvalRequestId || event.approvalId || event.id;
}

function approvalMatches(card: ApprovalCardView, event: ActivityEvent) {
  return Boolean(
    (event.callId && event.callId === card.callId) ||
      (event.approvalRequestId && event.approvalRequestId === card.approvalRequestId) ||
      (event.approvalId && event.approvalId === card.approvalId),
  );
}

/**
 * The same ask arrives twice: the worker's approval.asked (callId, approvalRequestId) and control's own
 * (approvalId only). Match by id first; otherwise pair an event that carries only one side with the latest
 * undecided card of the same tool that lacks that side.
 */
function findApprovalCard(cards: readonly ApprovalCardView[], event: ActivityEvent) {
  const exact = cards.find((card) => approvalMatches(card, event));
  if (exact) return exact;
  const controlSide = Boolean(event.approvalId) && !event.callId && !event.approvalRequestId;
  const workerSide = !event.approvalId && Boolean(event.callId || event.approvalRequestId);
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (card.outcome !== null || (event.toolName && card.toolName && card.toolName !== event.toolName)) continue;
    if (controlSide && !card.approvalId) return card;
    if (workerSide && !card.callId && !card.approvalRequestId) return card;
  }
  return undefined;
}

/**
 * Projects persisted events into chat items. Approval and question cards stay where they were asked.
 * `stoppedSequence` is where the user pressed stop: calls started up to there that are still running are over.
 */
export function buildTimeline(events: readonly ActivityEvent[], stoppedSequence = 0): TimelineItem[] {
  const items: TimelineItem[] = [];
  const tools = new ToolPairing();
  const cards: ApprovalCardView[] = [];
  const questions = new Map<string, QuestionCardView>();
  const userTextByTurn = new Map<string, string>();
  let lastUserText: string | null = null;

  const pushTool = (view: ToolCallView, id: string) => {
    const last = items[items.length - 1];
    if (last && last.kind === "tools" && last.turnId === view.turnId) last.calls.push(view);
    else items.push({ kind: "tools", id: `tools-${id}`, turnId: view.turnId, calls: [view] });
  };

  for (const event of events) {
    const turnId = event.turnId ?? "";
    tools.settle(event);
    switch (event.type) {
      case "assistant.message": {
        const text = event.text ?? "";
        if (!text) break;
        if (event.role === "user") {
          items.push({ kind: "user", id: event.id, text, turnId, steered: false });
          lastUserText = text;
          if (turnId) userTextByTurn.set(turnId, text);
        } else {
          const id = event.blockId ? blockItemId(turnId, event.blockId) : event.id;
          items.push({ kind: "assistant", id, text, turnId, agentId: event.agentId ?? "main", agentPath: agentPathOf(event) });
        }
        break;
      }
      case "room.steered": {
        const text = event.text ?? "";
        if (!text) break;
        items.push({ kind: "user", id: event.id, text, turnId, steered: true });
        lastUserText = text;
        break;
      }
      case "tool.call":
        pushTool(tools.call(event), event.id);
        break;
      case "tool.result": {
        const { view, isNew } = tools.result(event);
        if (isNew) pushTool(view, event.id);
        break;
      }
      case "approval.asked": {
        const existing = findApprovalCard(cards, event);
        const card: ApprovalCardView = {
          kind: "approval",
          id: existing?.id ?? `approval-${event.id}`,
          key: existing?.key ?? approvalKey(event),
          sequence: existing?.sequence ?? event.sequence,
          stopped: false,
          callId: event.callId || existing?.callId || "",
          approvalId: event.approvalId || existing?.approvalId || "",
          approvalRequestId: event.approvalRequestId || existing?.approvalRequestId || "",
          toolName: event.toolName || existing?.toolName || "",
          argsPreview: event.argsPreview || existing?.argsPreview || "",
          reason: event.reason || event.text || existing?.reason || "",
          risk: event.risk || existing?.risk || "",
          agentPath: existing && existing.agentPath !== "main" ? existing.agentPath : agentPathOf(event),
          outcome: existing?.outcome ?? null,
          decidedBy: existing?.decidedBy ?? "",
        };
        if (existing) Object.assign(existing, card);
        else {
          cards.push(card);
          items.push(card);
        }
        break;
      }
      case "approval.resolved": {
        for (const card of cards) {
          if (!approvalMatches(card, event)) continue;
          card.outcome = event.outcome || event.status || "decided";
          card.decidedBy = event.decidedBy ?? "";
        }
        break;
      }
      case "question.asked": {
        const question = event.question;
        if (!question?.questionId || questions.has(question.questionId)) break;
        const card: QuestionCardView = {
          kind: "question",
          id: `question-${event.id}`,
          questionId: question.questionId,
          text: question.text,
          choices: question.choices ?? [],
          allowCustom: question.allowCustom !== false,
          agentPath: question.agent?.agentPath || agentPathOf(event),
          answer: null,
        };
        questions.set(card.questionId, card);
        items.push(card);
        break;
      }
      case "question.answered": {
        const answer = event.answer;
        const card = answer ? questions.get(answer.questionId) : undefined;
        if (card && answer) card.answer = { choiceIds: answer.choiceIds ?? [], text: answer.text ?? "" };
        break;
      }
      case "turn.failed": {
        const failure = readFailure(event);
        if (!failure) break;
        const failedTurn = event.failure?.turnId || turnId;
        items.push({
          kind: "failure",
          id: event.id,
          turnId: failedTurn,
          errorCode: failure.errorCode,
          retryable: failure.retryable,
          retryText: userTextByTurn.get(failedTurn) ?? lastUserText,
        });
        break;
      }
      default:
        break;
    }
  }
  if (stoppedSequence > 0) {
    tools.close("任务已停止，这一步没有完成。", stoppedSequence);
    for (const card of cards) if (card.outcome === null && card.sequence <= stoppedSequence) card.stopped = true;
  }
  return items;
}

export function draftItems(drafts: readonly Draft[]): TimelineItem[] {
  return drafts
    .filter((draft) => draft.text)
    .map((draft) => ({ kind: "draft", id: blockItemId(draft.turnId, draft.blockId), text: draft.text, turnId: draft.turnId, agentId: draft.agentId, agentPath: draft.agentPath }));
}

const PROCESS_TYPES = new Set(["approval.asked", "approval.resolved", "agent.started", "agent.finished", "agent.spawn_rejected", "room.steered", "turn.failed"]);

/** Items for the 任务进程 rail: tool rows share the chat's pairing; lifecycle events stay one line each. */
export function buildProcess(events: readonly ActivityEvent[], stoppedSequence = 0): ProcessItem[] {
  const items: ProcessItem[] = [];
  const tools = new ToolPairing();
  for (const event of events) {
    tools.settle(event);
    if (event.type === "tool.call") items.push({ kind: "tool", id: event.id, call: tools.call(event) });
    else if (event.type === "tool.result") {
      const { view, isNew } = tools.result(event);
      if (isNew) items.push({ kind: "tool", id: event.id, call: view });
    } else if (PROCESS_TYPES.has(event.type)) items.push({ kind: "event", id: event.id, event });
  }
  if (stoppedSequence > 0) tools.close("任务已停止，这一步没有完成。", stoppedSequence);
  return items;
}

/**
 * A turn counts as running while a tool call started after the last stop has no result yet,
 * or an assistant block is still streaming.
 */
export function hasOpenWork(events: readonly ActivityEvent[], drafts: readonly Draft[], stoppedSequence = 0) {
  if (drafts.length > 0) return true;
  const open = new Set<string>();
  for (const event of events) {
    if (endsOpenCalls(event)) open.clear();
    else if (event.type === "tool.call" && event.callId && event.sequence > stoppedSequence) open.add(event.callId);
    else if (event.type === "tool.result" && event.callId) open.delete(event.callId);
  }
  return open.size > 0;
}

/** The most recent model mode reported by a worker event (A1 puts modelMode/modelName on every worker event). */
export function latestModel(events: readonly ActivityEvent[]): { mode: string; name: string } | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.modelMode) return { mode: event.modelMode, name: event.modelName ?? "" };
  }
  return null;
}
