import { readFailure, type ActivityEvent, type ToolState, type TurnErrorCode } from "./activity";
import type { Draft } from "./stream";

/** "unknown": the call never got a result and the turn has moved on. */
export type ToolRunState = "running" | "unknown" | ToolState;

export interface ToolCallView {
  key: string;
  callId: string;
  turnId: string;
  toolName: string;
  argsPreview: string;
  resultText: string;
  state: ToolRunState;
  errorCode: string | null;
  agentPath: string;
  startedAt: string;
  finishedAt: string;
}

export type TimelineItem =
  | { kind: "user"; id: string; text: string; turnId: string; steered: boolean }
  | { kind: "assistant"; id: string; text: string; turnId: string; agentId: string; agentPath: string }
  | { kind: "tools"; id: string; turnId: string; calls: ToolCallView[] }
  | { kind: "failure"; id: string; turnId: string; errorCode: TurnErrorCode; retryable: boolean; retryText: string | null }
  | { kind: "draft"; id: string; text: string; turnId: string; agentId: string; agentPath: string };

export type ProcessItem = { kind: "tool"; id: string; call: ToolCallView } | { kind: "event"; id: string; event: ActivityEvent };

function toolFromCall(event: ActivityEvent): ToolCallView {
  return {
    key: event.callId || event.id,
    callId: event.callId ?? "",
    turnId: event.turnId ?? "",
    toolName: event.toolName ?? "",
    argsPreview: event.argsPreview ?? "",
    resultText: "",
    state: "running",
    errorCode: null,
    agentPath: event.agentPath ?? event.agentId ?? "main",
    startedAt: event.occurredAt ?? "",
    finishedAt: "",
  };
}

function applyResult(call: ToolCallView, event: ActivityEvent) {
  call.state = event.toolState ?? (event.errorCode ? "error" : "success");
  call.resultText = event.text ?? "";
  call.errorCode = event.errorCode ?? null;
  call.finishedAt = event.occurredAt ?? "";
  if (!call.toolName) call.toolName = event.toolName ?? "";
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
    for (const view of this.running) if (view.state === "running") view.state = "unknown";
    this.running.clear();
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

/** Projects persisted events into chat items. Consecutive tool calls of one turn share a group. */
export function buildTimeline(events: readonly ActivityEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const tools = new ToolPairing();
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
          items.push({ kind: "assistant", id: event.id, text, turnId, agentId: event.agentId ?? "main", agentPath: event.agentPath ?? event.agentId ?? "main" });
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
  return items;
}

export function draftItems(drafts: readonly Draft[]): TimelineItem[] {
  return drafts
    .filter((draft) => draft.text)
    .map((draft) => ({ kind: "draft", id: `draft-${draft.key}`, text: draft.text, turnId: draft.turnId, agentId: draft.agentId, agentPath: draft.agentPath }));
}

const PROCESS_TYPES = new Set(["approval.asked", "approval.resolved", "agent.started", "agent.finished", "agent.spawn_rejected", "room.steered", "turn.failed"]);

/** Items for the 任务进程 rail: tool rows share the chat's pairing; lifecycle events stay one line each. */
export function buildProcess(events: readonly ActivityEvent[]): ProcessItem[] {
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
  return items;
}

/** Events after which a tool call that still has no result will never get one. */
function endsOpenCalls(event: ActivityEvent) {
  return (
    event.type === "turn.failed" ||
    event.type === "room.steered" ||
    (event.type === "assistant.message" && (event.role === "user" || (event.agentId ?? "main") === "main"))
  );
}

/** A turn counts as running while a tool call has no result yet or an assistant block is still streaming. */
export function hasOpenWork(events: readonly ActivityEvent[], drafts: readonly Draft[]) {
  if (drafts.length > 0) return true;
  const open = new Set<string>();
  for (const event of events) {
    if (endsOpenCalls(event)) open.clear();
    else if (event.type === "tool.call" && event.callId) open.add(event.callId);
    else if (event.type === "tool.result" && event.callId) open.delete(event.callId);
  }
  return open.size > 0;
}
