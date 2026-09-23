"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelRight, Plus, Search, Users } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { DetailDrawer } from "@/components/rooms/detail-drawer";
import { MessageTimeline } from "@/components/rooms/message-timeline";
import { TaskComposer } from "@/components/rooms/task-composer";
import {
  CONTROL_URL,
  control,
  type ActivityEvent,
  type Approval,
  type ChatMessage,
  type PermissionPreset,
  type Room,
} from "@/lib/control";
import {
  DEFAULT_PERSONAS,
  buildRoster,
  type ComposerMode,
  type DrawerTab,
} from "@/lib/rooms-ui";
import { cn } from "@/lib/utils";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("execute");
  const [permissionPreset, setPermissionPreset] =
    useState<PermissionPreset>("workspace-write");
  const [collabIntent, setCollabIntent] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("activity");
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONAS[0].id);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [connection, setConnection] = useState<
    "live" | "reconnecting" | "offline"
  >("offline");

  const active = useMemo(
    () => rooms.find((room) => room.id === activeId) ?? null,
    [rooms, activeId],
  );

  const leadPersona =
    DEFAULT_PERSONAS.find((item) => item.id === personaId) ??
    DEFAULT_PERSONAS[0];

  const roster = useMemo(
    () =>
      buildRoster({
        kind: active?.kind ?? (collabIntent ? "collab" : "solo"),
        activity,
        leadPersona,
      }),
    [active?.kind, activity, collabIntent, leadPersona],
  );

  const pending = useMemo(
    () =>
      approvals.filter(
        (item) => item.status === "pending" && item.roomId === activeId,
      ),
    [approvals, activeId],
  );

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (room) =>
        room.title.toLowerCase().includes(q) ||
        room.id.toLowerCase().includes(q) ||
        room.state.toLowerCase().includes(q),
    );
  }, [rooms, query]);

  const refresh = useCallback(
    async (roomId?: string | null) => {
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
    },
    [activeId],
  );

  useEffect(() => {
    const start = window.setTimeout(() => {
      refresh().catch((err: unknown) => setError(String(err)));
    }, 0);
    return () => window.clearTimeout(start);
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    const src = new EventSource(`${CONTROL_URL}/v1/rooms/${activeId}/events`);
    // Defer connection flips out of the effect body to satisfy react-hooks lint.
    const reconnecting = window.setTimeout(
      () => setConnection("reconnecting"),
      0,
    );
    src.onopen = () => setConnection("live");
    src.onmessage = () => {
      void refresh(activeId);
    };
    src.onerror = () => {
      setConnection("offline");
      src.close();
    };
    return () => {
      window.clearTimeout(reconnecting);
      src.close();
    };
  }, [activeId, refresh]);

  async function selectRoom(id: string) {
    setError(null);
    setFocusAgentId(null);
    const room = rooms.find((item) => item.id === id);
    setDrawerTab(room?.kind === "collab" ? "roster" : "activity");
    await refresh(id);
  }

  async function createAndMaybeSend(args: {
    title: string;
    kind: "solo" | "collab";
    message?: string;
    seedMessages?: string[];
  }) {
    const room = await control.createRoom({
      title: args.title,
      kind: args.kind,
      permissionPreset,
    });
    if (args.seedMessages?.length) {
      for (const text of args.seedMessages) {
        await control.postMessage(room.id, text);
      }
    }
    if (args.message) {
      await control.postMessage(room.id, args.message);
    }
    setCollabIntent(args.kind === "collab");
    setDrawerOpen(true);
    setDrawerTab(args.kind === "collab" ? "roster" : "activity");
    await refresh(room.id);
    return room;
  }

  async function onSubmitComposer() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const kind = collabIntent ? "collab" : "solo";

      if (!activeId) {
        await createAndMaybeSend({
          title: text.slice(0, 48) || `任务 ${rooms.length + 1}`,
          kind,
          message: text,
        });
        setDraft("");
        setComposerMode("execute");
        return;
      }

      if (composerMode === "steer") {
        await control.steerRoom(activeId, text);
      } else {
        await control.postMessage(activeId, text);
      }
      setDraft("");
      setComposerMode("execute");
      await refresh(activeId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onStopTurn() {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      await control.abortRoom(activeId);
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

  async function onEnableTeam() {
    if (!active || active.kind === "collab") return;
    const ok = window.confirm(
      "将开一个协作房间；当前房间保持单 Agent。是否继续？",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const summary = messages
        .slice(-6)
        .map((msg) => `${msg.role}: ${msg.text}`)
        .join("\n");
      await createAndMaybeSend({
        title: `${active.title} · 团队`,
        kind: "collab",
        seedMessages: [
          `【从单体分叉】继承上下文摘要：\n${summary || active.title}`,
        ],
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function startBlankTask() {
    setActiveId(null);
    setMessages([]);
    setActivity([]);
    setDraft("");
    setDrawerOpen(true);
    setDrawerTab("activity");
    setFocusAgentId(null);
  }

  const running = active?.state === "running";

  return (
    <section className="flex h-dvh min-h-0 flex-col" aria-label="Rooms 工作台">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-3">
        <p className="text-sm font-semibold text-foreground">Orbit</p>
        <AppNav compact />
        <div className="ml-auto flex items-center gap-2 text-xs">
          {connection === "live" ? (
            <Tag color="success">已连接</Tag>
          ) : connection === "reconnecting" ? (
            <Tag color="attention">重连中</Tag>
          ) : (
            <Tag>离线</Tag>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="border-b border-sidebar-border p-3">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={startBlankTask}
            >
              <Plus className="size-4" aria-hidden />
              新任务
            </Button>
          </div>
          <div className="border-b border-sidebar-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索任务"
                className="h-8 pl-8"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 list-none space-y-1 overflow-auto p-2">
            {filteredRooms.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                暂无任务
              </li>
            ) : (
              filteredRooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => void selectRoom(room.id)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      room.id === activeId
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/70",
                    )}
                  >
                    <div className="truncate">{room.title || room.id}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{room.kind === "solo" ? "单 Agent" : "协作"}</span>
                      <span>·</span>
                      <span className="tabular-nums">{room.state}</span>
                      {approvals.some(
                        (item) =>
                          item.status === "pending" && item.roomId === room.id,
                      ) ? (
                        <span className="ml-auto size-1.5 rounded-full bg-danger" />
                      ) : null}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            {active ? (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {active.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag
                      color={active.kind === "collab" ? "advanced" : "default"}
                    >
                      {active.kind === "collab" ? "协作" : "单 Agent"}
                    </Tag>
                    <Tag color="processing">{active.permissionPreset}</Tag>
                    <span className="tabular-nums">{active.state}</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    Persona
                    <select
                      aria-label="主 Persona"
                      value={personaId}
                      onChange={(event) => setPersonaId(event.target.value)}
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {DEFAULT_PERSONAS.map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {persona.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {active.kind === "solo" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onEnableTeam()}
                    >
                      <Users className="size-3.5" aria-hidden />
                      启用团队
                    </Button>
                  ) : (
                    <Tag color="advanced">团队 · {roster.length}</Tag>
                  )}
                  {!drawerOpen ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDrawerOpen(true)}
                    >
                      <PanelRight className="size-4" aria-hidden />
                      详情
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-foreground">新任务</p>
                  <p className="text-xs text-muted-foreground">
                    WorkBuddy 级单体工作台 · 协作同壳展开
                  </p>
                </div>
                <div className="ml-auto">
                  {!drawerOpen ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDrawerOpen(true)}
                    >
                      <PanelRight className="size-4" />
                      详情
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
            {!active ? (
              <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    Orbit
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    下任务 → 看执行 → 追问 → 看结果。需要协作时在同一壳层展开团队。
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "梳理本周发布风险",
                      "给 PR 写审查清单",
                      "总结审批队列",
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-foreground hover:bg-primary-soft"
                        onClick={() => setDraft(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
                <TaskComposer
                  value={draft}
                  onChange={setDraft}
                  mode={composerMode}
                  onModeChange={setComposerMode}
                  permissionPreset={permissionPreset}
                  onPermissionChange={setPermissionPreset}
                  collabIntent={collabIntent}
                  onCollabIntentChange={setCollabIntent}
                  running={false}
                  busy={busy}
                  emptyCreate
                  onSubmit={() => void onSubmitComposer()}
                  onStop={() => void onStopTurn()}
                />
              </div>
            ) : (
              <>
                <MessageTimeline
                  messages={messages}
                  activity={activity}
                  pendingApprovals={pending}
                  busy={busy}
                  focusAgentId={focusAgentId}
                  onDecide={(id, decision) => void onDecide(id, decision)}
                />
                <div className="shrink-0 pt-2">
                  <TaskComposer
                    value={draft}
                    onChange={setDraft}
                    mode={composerMode}
                    onModeChange={setComposerMode}
                    permissionPreset={permissionPreset}
                    onPermissionChange={setPermissionPreset}
                    collabIntent={active.kind === "collab" || collabIntent}
                    onCollabIntentChange={setCollabIntent}
                    running={running}
                    busy={busy}
                    disabled={active.state === "closed"}
                    onSubmit={() => void onSubmitComposer()}
                    onStop={() => void onStopTurn()}
                  />
                </div>
              </>
            )}
            {error ? (
              <p className="mt-2 text-sm text-danger-foreground">{error}</p>
            ) : null}
          </div>
        </div>

        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          activity={activity}
          roster={roster}
          focusAgentId={focusAgentId}
          onFocusAgent={setFocusAgentId}
          isCollab={active?.kind === "collab"}
        />
      </div>
    </section>
  );
}
