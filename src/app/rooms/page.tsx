"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTROL_URL,
  control,
  type Approval,
  type ChatMessage,
  type Room,
} from "@/lib/control";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<string[]>([]);

  const active = useMemo(
    () => rooms.find((r) => r.id === activeId) ?? null,
    [rooms, activeId],
  );

  const refresh = useCallback(async (roomId?: string | null) => {
    const [roomList, approvalList] = await Promise.all([
      control.listRooms(),
      control.listApprovals(),
    ]);
    setRooms(roomList.items);
    setApprovals(approvalList.items);
    const id = roomId ?? activeId ?? roomList.items[0]?.id ?? null;
    if (id) {
      const msgs = await control.listMessages(id);
      setMessages(msgs.items);
      setActiveId(id);
    }
  }, [activeId]);

  useEffect(() => {
    const start = window.setTimeout(() => {
      refresh().catch((err: unknown) => setError(String(err)));
    }, 0);
    return () => window.clearTimeout(start);
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    const src = new EventSource(`${CONTROL_URL}/v1/rooms/${activeId}/events`);
    src.onmessage = (ev) => {
      setLive((rows) => [...rows.slice(-40), ev.data]);
      void refresh(activeId);
    };
    src.onerror = () => src.close();
    return () => src.close();
  }, [activeId, refresh]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const room = await control.createRoom(`Room ${rooms.length + 1}`);
      await refresh(room.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSend(ev: FormEvent) {
    ev.preventDefault();
    if (!activeId || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await control.postMessage(activeId, draft.trim());
      setDraft("");
      await refresh(activeId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(id: string, decision: "allow" | "reject") {
    setBusy(true);
    try {
      await control.decide(id, decision);
      await refresh(activeId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const pending = approvals.filter(
    (a) => a.status === "pending" && a.roomId === activeId,
  );

  return (
    <section className="flex min-h-[70vh] gap-6" aria-labelledby="rooms-title">
      <aside className="w-56 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <h1 id="rooms-title" className="text-xl font-semibold">
            Rooms
          </h1>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            New
          </button>
        </div>
        <ul className="space-y-1">
          {rooms.length === 0 ? (
            <li className="text-sm text-zinc-500">No rooms yet.</li>
          ) : (
            rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => void refresh(room.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    room.id === activeId ? "bg-zinc-200 font-medium" : "hover:bg-zinc-100"
                  }`}
                >
                  <div>{room.title || room.id}</div>
                  <div className="text-xs text-zinc-500">
                    {room.kind} · {room.state}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <p className="text-sm text-zinc-500">选择或创建一个房间</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-zinc-600">
                {active.title} · {active.state}
              </p>
              <button
                type="button"
                className="text-xs text-zinc-500 underline"
                onClick={() => activeId && void control.abortRoom(activeId).then(() => refresh(activeId))}
              >
                Abort
              </button>
            </div>
            {pending.map((item) => (
              <div
                key={item.id}
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
              >
                <p className="font-medium">Approval needed: {item.toolName}</p>
                {item.reason ? <p className="text-zinc-600">{item.reason}</p> : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded bg-zinc-900 px-3 py-1 text-white"
                    onClick={() => void onDecide(item.id, "allow")}
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border border-zinc-300 px-3 py-1"
                    onClick={() => void onDecide(item.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            <div className="flex-1 space-y-2 overflow-auto rounded-md border border-zinc-200 bg-white p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-zinc-500">No messages yet.</p>
              ) : (
                messages.map((msg) => (
                  <article key={msg.id} className="text-sm">
                    <div className="text-xs uppercase tracking-wide text-zinc-400">
                      {msg.role}
                    </div>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </article>
                ))
              )}
            </div>
            <form onSubmit={(ev) => void onSend(ev)} className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message the agent"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                disabled={busy || active.state !== "running"}
              />
              <button
                type="submit"
                disabled={busy || active.state !== "running"}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Send
              </button>
            </form>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            {live.length > 0 ? (
              <p className="mt-2 truncate text-xs text-zinc-400">
                live: {live[live.length - 1]}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
