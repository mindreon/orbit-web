import type { ActivityEvent } from "./activity";

/** Live text of one assistant block, built from assistant.delta frames. Never persisted. */
export interface Draft {
  key: string;
  turnId: string;
  agentId: string;
  agentPath: string;
  blockId: string;
  attempt: number;
  /** Highest seq appended so far. A chunk at or below it is a duplicate or arrived out of order, and is dropped. */
  lastSeq: number;
  text: string;
  order: number;
}

export interface RoomStream {
  /** Persisted events, ordered by sequence, unique by id. */
  events: readonly ActivityEvent[];
  seen: ReadonlySet<string>;
  drafts: Readonly<Record<string, Draft>>;
  /** Highest activityAttempt seen per turnId|agentId. Deltas from lower attempts are stale. */
  attempts: Readonly<Record<string, number>>;
  /** turnId|blockId that already has its final assistant.message. */
  finalBlocks: ReadonlySet<string>;
  /** turnId|blockId|attempt whose draft was dropped on reconnect or reset; wait for the final message. */
  abandoned: ReadonlySet<string>;
  lastEventId: string | null;
  lastSequence: number;
  /** lastSequence when the user pressed stop. Work started at or before it is over. */
  stoppedSequence: number;
  nextDraftOrder: number;
}

export type StreamInput = { event: ActivityEvent | null; sseId?: string };

export type StreamAction =
  | { type: "snapshot"; items: readonly ActivityEvent[]; mode: "merge" | "rebuild" }
  | { type: "events"; items: readonly StreamInput[] }
  /** The SSE connection came back after a drop: unfinished drafts cannot be completed from deltas any more. */
  | { type: "abandonDrafts" }
  /** The user stopped the turn. */
  | { type: "stopped" };

export function emptyStream(): RoomStream {
  return {
    events: [],
    seen: new Set(),
    drafts: {},
    attempts: {},
    finalBlocks: new Set(),
    abandoned: new Set(),
    lastEventId: null,
    lastSequence: 0,
    stoppedSequence: 0,
    nextDraftOrder: 0,
  };
}

const blockKey = (turnId: string, blockId: string) => `${turnId}|${blockId}`;
const attemptKey = (turnId: string, agentId: string) => `${turnId}|${agentId}`;

/** Working copy for one action, so a batch of events copies each collection once. */
class Draftable {
  events: ActivityEvent[];
  seen: Set<string>;
  drafts: Record<string, Draft>;
  attempts: Record<string, number>;
  finalBlocks: Set<string>;
  abandoned: Set<string>;
  lastEventId: string | null;
  lastSequence: number;
  stoppedSequence: number;
  nextDraftOrder: number;

  constructor(state: RoomStream) {
    this.events = [...state.events];
    this.seen = new Set(state.seen);
    this.drafts = { ...state.drafts };
    this.attempts = { ...state.attempts };
    this.finalBlocks = new Set(state.finalBlocks);
    this.abandoned = new Set(state.abandoned);
    this.lastEventId = state.lastEventId;
    this.lastSequence = state.lastSequence;
    this.stoppedSequence = state.stoppedSequence;
    this.nextDraftOrder = state.nextDraftOrder;
  }

  done(): RoomStream {
    return {
      events: this.events,
      seen: this.seen,
      drafts: this.drafts,
      attempts: this.attempts,
      finalBlocks: this.finalBlocks,
      abandoned: this.abandoned,
      lastEventId: this.lastEventId,
      lastSequence: this.lastSequence,
      stoppedSequence: this.stoppedSequence,
      nextDraftOrder: this.nextDraftOrder,
    };
  }

  abandonAll() {
    for (const draft of Object.values(this.drafts)) {
      this.abandoned.add(`${blockKey(draft.turnId, draft.blockId)}|${draft.attempt}`);
    }
    this.drafts = {};
  }

  dropDrafts(match: (draft: Draft) => boolean, markFinal: boolean) {
    for (const [key, draft] of Object.entries(this.drafts)) {
      if (!match(draft)) continue;
      if (markFinal) this.finalBlocks.add(key);
      delete this.drafts[key];
    }
  }

  /** Returns true when the event was new. */
  insert(event: ActivityEvent): boolean {
    if (event.id) {
      if (this.seen.has(event.id)) return false;
      this.seen.add(event.id);
    }
    const list = this.events;
    let at = list.length;
    if (event.sequence > 0) {
      while (at > 0 && list[at - 1].sequence > event.sequence) at -= 1;
    }
    if (at === list.length) list.push(event);
    else list.splice(at, 0, event);
    if (event.sequence > this.lastSequence) this.lastSequence = event.sequence;
    this.settleDrafts(event);
    return true;
  }

  /** A persisted event can end live drafts: the final text replaces them, a failed turn discards them. */
  settleDrafts(event: ActivityEvent) {
    const turnId = event.turnId ?? "";
    if (event.type === "assistant.message" && event.role !== "user") {
      if (event.blockId) {
        const key = blockKey(turnId, event.blockId);
        this.finalBlocks.add(key);
        delete this.drafts[key];
        return;
      }
      const agentId = event.agentId ?? "main";
      this.dropDrafts((draft) => draft.agentId === agentId && (!turnId || draft.turnId === turnId), true);
      return;
    }
    if (event.type === "turn.failed") {
      const failedTurn = event.failure?.turnId || turnId;
      this.dropDrafts((draft) => draft.turnId === failedTurn, true);
    }
  }

  delta(event: ActivityEvent) {
    const turnId = event.turnId ?? "";
    const agentId = event.agentId ?? "main";
    const blockId = event.blockId ?? "";
    const seq = event.seq ?? 0;
    const attempt = event.activityAttempt ?? 1;
    const text = event.delta ?? "";

    const aKey = attemptKey(turnId, agentId);
    const known = this.attempts[aKey] ?? 0;
    if (attempt < known) return;
    if (attempt > known) {
      this.attempts[aKey] = attempt;
      this.dropDrafts((draft) => draft.turnId === turnId && draft.agentId === agentId, false);
    }

    const key = blockKey(turnId, blockId);
    if (this.finalBlocks.has(key) || this.abandoned.has(`${key}|${attempt}`)) return;

    const previous = this.drafts[key];
    if (previous && seq <= previous.lastSeq) return;
    if (!text && !previous) return;
    this.drafts[key] = {
      key,
      turnId,
      agentId,
      agentPath: event.agentPath ?? agentId,
      blockId,
      attempt,
      lastSeq: seq,
      text: (previous?.text ?? "") + text,
      order: previous?.order ?? this.nextDraftOrder++,
    };
  }
}

function lastPersisted(items: readonly ActivityEvent[]) {
  let best: ActivityEvent | null = null;
  for (const item of items) {
    if (!item.id) continue;
    if (!best || item.sequence >= best.sequence) best = item;
  }
  return best;
}

export function reduceStream(state: RoomStream, action: StreamAction): RoomStream {
  if (action.type === "abandonDrafts" || action.type === "stopped") {
    if (action.type === "abandonDrafts" && Object.keys(state.drafts).length === 0) return state;
    const next = new Draftable(state);
    next.abandonAll();
    if (action.type === "stopped") next.stoppedSequence = next.lastSequence;
    return next.done();
  }

  if (action.type === "snapshot") {
    if (action.mode === "rebuild") {
      // Server history was rewritten. Start over, but remember which drafts were cut off so their late deltas stay hidden.
      const carried = new Draftable(state);
      carried.abandonAll();
      const fresh = new Draftable({ ...emptyStream(), attempts: carried.attempts, abandoned: carried.abandoned, finalBlocks: carried.finalBlocks });
      for (const item of action.items) if (item.type !== "assistant.delta") fresh.insert(item);
      fresh.lastEventId = lastPersisted(action.items)?.id ?? null;
      return fresh.done();
    }
    const next = new Draftable(state);
    let changed = false;
    for (const item of action.items) if (item.type !== "assistant.delta" && next.insert(item)) changed = true;
    const newest = lastPersisted(action.items);
    if (newest && (state.lastEventId === null || newest.sequence >= state.lastSequence)) {
      next.lastEventId = newest.id;
      changed = true;
    }
    return changed ? next.done() : state;
  }

  const next = new Draftable(state);
  for (const { event, sseId } of action.items) {
    const id = sseId || event?.id;
    if (id) next.lastEventId = id;
    if (!event) continue;
    if (event.type === "assistant.delta") next.delta(event);
    else next.insert(event);
  }
  return next.done();
}

export function orderedDrafts(stream: RoomStream): Draft[] {
  return Object.values(stream.drafts).sort((a, b) => a.order - b.order);
}
