import { useEffect } from "react";
import { create } from "zustand";
import { describeRoomFailure, isCallerAbort, listActivity } from "../rooms";
import { parseActivityEvent, type ActivityEvent } from "./activity";
import { scheduleFrame } from "../frame";
import { openEventStream, type SseFrame, type StreamStatus } from "./sse";
import { emptyStream, reduceStream, type RoomStream, type StreamAction, type StreamInput } from "./stream";

interface StreamsState {
  rooms: Record<string, RoomStream>;
  status: Record<string, StreamStatus>;
  /** The first /activity request for the room has finished, successfully or not. */
  loaded: Record<string, boolean>;
  /** Why the last /activity request failed; cleared by the next success. */
  loadError: Record<string, string | null>;
  dispatch: (roomId: string, action: StreamAction) => void;
  setStatus: (roomId: string, status: StreamStatus) => void;
  markLoaded: (roomId: string, error: string | null) => void;
}

export const useStreams = create<StreamsState>((set, get) => ({
  rooms: {},
  status: {},
  loaded: {},
  loadError: {},
  dispatch: (roomId, action) => {
    const current = get().rooms[roomId] ?? emptyStream();
    const next = reduceStream(current, action);
    if (next !== current) set({ rooms: { ...get().rooms, [roomId]: next } });
  },
  setStatus: (roomId, status) => {
    if (get().status[roomId] !== status) set({ status: { ...get().status, [roomId]: status } });
  },
  markLoaded: (roomId, error) => {
    if (get().loaded[roomId] && (get().loadError[roomId] ?? null) === error) return;
    set({ loaded: { ...get().loaded, [roomId]: true }, loadError: { ...get().loadError, [roomId]: error } });
  },
}));

const EMPTY = emptyStream();

export function useRoomStream(roomId: string | null | undefined): RoomStream {
  return useStreams((s) => (roomId ? s.rooms[roomId] : undefined) ?? EMPTY);
}

async function fetchActivity(roomId: string): Promise<ActivityEvent[]> {
  const body = await listActivity(roomId);
  const items: ActivityEvent[] = [];
  for (const raw of body.items ?? []) {
    const event = parseActivityEvent(raw);
    if (event) items.push(event);
  }
  return items;
}

/**
 * Pulls /activity and merges it (dedupe by id). Used after send/stop/decide, so the conversation is right
 * even if the SSE connection was down while the turn ran.
 */
export async function resyncActivity(roomId: string): Promise<void> {
  const { dispatch, markLoaded } = useStreams.getState();
  try {
    const items = await fetchActivity(roomId);
    dispatch(roomId, { type: "snapshot", items, mode: "merge" });
    markLoaded(roomId, null);
  } catch (error) {
    if (isCallerAbort(error)) return;
    markLoaded(roomId, describeRoomFailure("对话加载失败", error));
    throw error;
  }
}

/** The user stopped the turn: live drafts end, and calls still marked running stop counting as running. */
export function markStopped(roomId: string) {
  useStreams.getState().dispatch(roomId, { type: "stopped" });
}

function isReset(frame: SseFrame, parsed: unknown) {
  if (frame.event === "reset") return true;
  return typeof parsed === "object" && parsed !== null && (parsed as { type?: unknown }).type === "reset";
}

/**
 * Keeps the room's conversation live: loads /activity, then follows /events with Last-Event-ID.
 * Frames are applied on the shared frame scheduler (lib/frame.ts): a fast delta stream costs one commit per frame.
 */
export function useRoomEventStream(roomId: string | null | undefined) {
  useEffect(() => {
    if (!roomId) return;
    const id = roomId;
    const { dispatch, setStatus } = useStreams.getState();
    let disposed = false;
    let closeStream: (() => void) | null = null;
    let pending: StreamInput[] = [];
    /** Non-null while a reset refetch is in flight; frames that arrive meanwhile wait here. */
    let held: StreamInput[] | null = null;
    let resetToken = 0;

    const flush = () => {
      if (pending.length === 0) return;
      const items = pending;
      pending = [];
      dispatch(id, { type: "events", items });
    };

    const rebuild = async () => {
      const token = ++resetToken;
      pending = [];
      held = [];
      try {
        const items = await fetchActivity(id);
        if (disposed || token !== resetToken) return;
        dispatch(id, { type: "snapshot", items, mode: "rebuild" });
        const after = held;
        held = null;
        if (after.length > 0) dispatch(id, { type: "events", items: after });
      } catch {
        if (disposed || token !== resetToken) return;
        // Keep holding frames; the next reset or reconnect retries.
        setTimeout(() => {
          if (!disposed && token === resetToken) void rebuild();
        }, 2000);
      }
    };

    const onFrame = (frame: SseFrame) => {
      let parsed: unknown = null;
      if (frame.data) {
        try {
          parsed = JSON.parse(frame.data);
        } catch {
          parsed = null;
        }
      }
      if (isReset(frame, parsed)) {
        void rebuild();
        return;
      }
      const input: StreamInput = { event: parseActivityEvent(parsed, frame.id), sseId: frame.id };
      if (held) {
        held.push(input);
        return;
      }
      pending.push(input);
      scheduleFrame(flush);
    };

    const start = async () => {
      setStatus(id, "connecting");
      // Drafts left from an earlier visit were cut off when that connection closed; their deltas are not replayed.
      dispatch(id, { type: "abandonDrafts" });
      // A failure is shown in the conversation; the stream still opens and the next resync fills history.
      await resyncActivity(id).catch(() => undefined);
      if (disposed) return;
      closeStream = openEventStream({
        url: `/v1/rooms/${encodeURIComponent(id)}/events`,
        lastEventId: () => useStreams.getState().rooms[id]?.lastEventId ?? null,
        onOpen: ({ reconnect }) => {
          if (!reconnect) return;
          flush();
          dispatch(id, { type: "abandonDrafts" });
          // Last-Event-ID lets the server replay what was missed; merging /activity (dedupe by id) covers a server that cannot.
          void resyncActivity(id).catch(() => undefined);
        },
        onFrame,
        onStatus: (status) => setStatus(id, status),
      });
    };

    void start();
    return () => {
      disposed = true;
      closeStream?.();
      flush();
    };
  }, [roomId]);
}
