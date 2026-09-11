"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTROL_URL,
  control,
  type ActivityEvent,
  type Approval,
  type ChatMessage,
  type PermissionPreset,
  type Room,
} from "@/lib/control";

function activityLabel(item: ActivityEvent) {
  switch (item.type) {
    case "session.status":
      return `会话状态：${item.status ?? "已更新"}`;
    case "tool.call":
      return `调用工具：${item.toolName ?? "tool"}`;
    case "tool.result":
      return `工具结果：${item.toolName ?? item.callId ?? "tool"}`;
    case "approval.asked":
      return `等待审批：${item.toolName ?? "tool"}`;
    case "agent.started":
      return "子 Agent 已启动";
    case "agent.finished":
      return "子 Agent 已完成";
    case "usage":
      return "用量已更新";
    case "room.steered":
      return `调整方向：${item.text ?? ""}`;
    default:
      return item.role === "user" ? "已提交任务消息" : "Agent 输出";
  }
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"solo" | "collab">("solo");
  const [permissionPreset, setPermissionPreset] =
    useState<PermissionPreset>("workspace-write");
  const [steer, setSteer] = useState("");

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
      const [msgs, trace] = await Promise.all([
        control.listMessages(id),
        control.listActivity(id),
      ]);
      setMessages(msgs.items);
      setActivity(trace.items);
      setActiveId(id);
    } else {
      setMessages([]);
      setActivity([]);
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
    src.onmessage = () => {
      void refresh(activeId);
    };
    src.onerror = () => src.close();
    return () => src.close();
  }, [activeId, refresh]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const room = await control.createRoom({
        title: newTitle.trim() || `任务 ${rooms.length + 1}`,
        kind: newKind,
        permissionPreset,
      });
      setNewTitle("");
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

  async function onSteer(ev: FormEvent) {
    ev.preventDefault();
    if (!activeId || !steer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await control.steerRoom(activeId, steer.trim());
      setSteer("");
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
    <section
      className="grid min-h-[70vh] gap-5 xl:grid-cols-[15rem_minmax(0,1fr)_19rem]"
      aria-labelledby="rooms-title"
    >
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-4">
          <h1 id="rooms-title" className="text-xl font-semibold">
            对话任务
          </h1>
          <p className="mt-1 text-xs text-zinc-500">创建任务时固定 dsh 执行策略</p>
        </div>
        <div className="mb-5 space-y-2 border-b border-zinc-100 pb-5">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="任务名称"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="任务类型"
              value={newKind}
              onChange={(event) => setNewKind(event.target.value as "solo" | "collab")}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs"
            >
              <option value="solo">单 Agent</option>
              <option value="collab">协作模式</option>
            </select>
            <select
              aria-label="权限预设"
              value={permissionPreset}
              onChange={(event) =>
                setPermissionPreset(event.target.value as PermissionPreset)
              }
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs"
            >
              <option value="workspace-write">工作区可写</option>
              <option value="danger-full-access">完全访问</option>
            </select>
          </div>
          {permissionPreset === "danger-full-access" ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              完全访问会关闭 dsh 的默认审批，仅用于明确授权的受控环境。
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            新建任务
          </button>
        </div>
        <ul className="space-y-1">
          {rooms.length === 0 ? (
            <li className="text-sm text-zinc-500">暂无任务</li>
          ) : (
            rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => void refresh(room.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${
                    room.id === activeId
                      ? "bg-blue-50 font-medium text-blue-900"
                      : "hover:bg-zinc-50"
                  }`}
                >
                  <div>{room.title || room.id}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {room.kind === "solo" ? "单 Agent" : "协作"} · {room.state}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-5">
        {!active ? (
          <p className="text-sm text-zinc-500">选择或创建一个房间</p>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <p className="font-semibold text-zinc-900">{active.title}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">
                    dsh / ACP
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-1">
                    {active.runtime.isolation} isolation
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                    {active.permissionPreset}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
                onClick={() => activeId && void control.abortRoom(activeId).then(() => refresh(activeId))}
              >
                终止
              </button>
            </div>
            {pending.map((item) => (
              <div
                key={item.id}
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
              >
                <p className="font-medium">需要审批：{item.toolName}</p>
                {item.reason ? <p className="text-zinc-600">{item.reason}</p> : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded bg-zinc-900 px-3 py-1 text-white"
                    onClick={() => void onDecide(item.id, "allow")}
                  >
                    允许一次
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border border-zinc-300 px-3 py-1"
                    onClick={() => void onDecide(item.id, "reject")}
                  >
                    拒绝并终止
                  </button>
                </div>
              </div>
            ))}
            <div className="min-h-80 flex-1 space-y-3 overflow-auto rounded-xl bg-zinc-50 p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  输入任务目标。模型调用、工具执行和审批会显示在右侧轨迹中。
                </p>
              ) : (
                messages.map((msg) => (
                  <article
                    key={msg.id}
                    className={`max-w-[85%] rounded-xl p-3 text-sm ${
                      msg.role === "user"
                        ? "ml-auto bg-blue-600 text-white"
                        : "border border-zinc-200 bg-white"
                    }`}
                  >
                    <div
                      className={`mb-1 text-xs ${
                        msg.role === "user" ? "text-blue-100" : "text-zinc-400"
                      }`}
                    >
                      {msg.role === "user" ? "你" : "Orbit Agent"}
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
                placeholder="描述目标或继续补充上下文"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                disabled={busy || active.state !== "running"}
              />
              <button
                type="submit"
                disabled={busy || active.state !== "running"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                发送
              </button>
            </form>
            <form onSubmit={(ev) => void onSteer(ev)} className="mt-2 flex gap-2">
              <input
                value={steer}
                onChange={(event) => setSteer(event.target.value)}
                placeholder="中途调整方向（steer）"
                className="flex-1 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm"
                disabled={busy || active.state !== "running"}
              />
              <button
                type="submit"
                disabled={busy || active.state !== "running" || !steer.trim()}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                调整
              </button>
            </form>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          </>
        )}
      </div>
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">执行轨迹</h2>
            <p className="mt-1 text-xs text-zinc-500">标准 Orbit 事件，不暴露 ACP 原始帧</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
            {activity.length}
          </span>
        </div>
        <ol className="space-y-3">
          {activity.length === 0 ? (
            <li className="text-sm text-zinc-500">暂无运行记录</li>
          ) : (
            activity.slice(-30).reverse().map((item) => (
              <li key={item.id} className="relative border-l border-zinc-200 pl-3 text-xs">
                <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
                <p className="font-medium text-zinc-700">{activityLabel(item)}</p>
                <p className="mt-1 text-zinc-400">
                  #{item.sequence} · {item.source} ·{" "}
                  {new Date(item.occurredAt).toLocaleTimeString()}
                </p>
                {item.reason ? <p className="mt-1 text-zinc-500">{item.reason}</p> : null}
              </li>
            ))
          )}
        </ol>
      </aside>
    </section>
  );
}
