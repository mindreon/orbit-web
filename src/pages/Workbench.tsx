import { useEffect, useState } from "react";
import { FILTERS, matterTitle, permissionLabel, stateLabel, type FilterId, type PermissionPreset } from "../model";
import { useMind } from "../store";
import { Area, Button } from "../ui";
import { cn } from "../lib/cn";
import type { ActivityEvent, ChatMessage } from "../lib/rooms";

const emptyMessages: ChatMessage[] = [];
const emptyActivity: ActivityEvent[] = [];

export function WorkbenchPage() {
  const loadRooms = useMind((s) => s.loadRooms);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const role = useMind((s) => s.role);
  const filter = useMind((s) => s.filter);
  const setFilter = useMind((s) => s.setFilter);
  const matters = useMind((s) => s.matters);
  const activeId = useMind((s) => s.activeId);
  const loading = useMind((s) => s.loading);
  const error = useMind((s) => s.error);
  const selectMatter = useMind((s) => s.selectMatter);
  const startBlank = useMind((s) => s.startBlank);

  const visible = matters.filter((matter) => {
    if (filter === "已完成") return matter.state === "closed";
    if (filter === "待我确认") return matter.state === "awaiting_approval";
    return matter.state !== "closed";
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="bg-sidebar flex min-h-0 flex-col border-r border-sidebar-border">
          {role === "经办人" ? (
            <div className="border-b border-sidebar-border p-3">
              <Button className="w-full" variant={activeId === null ? "primary" : "outline"} onClick={startBlank}>
                新事项
              </Button>
            </div>
          ) : null}
          <div className="flex gap-1 p-2 text-xs">
            {FILTERS.map((item) => (
              <button
                key={item}
                className={cn(
                  "rounded-md px-2 py-1",
                  filter === item ? "bg-sidebar-accent text-accent-foreground" : "text-muted-foreground",
                )}
                onClick={() => setFilter(item as FilterId)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {error && matters.length === 0 ? <p className="text-destructive p-4 text-sm">{error}</p> : null}
            {loading && matters.length === 0 ? <p className="text-muted-foreground p-4 text-sm">正在读取事项…</p> : null}
            {visible.map((matter) => (
              <button
                key={matter.id}
                className={cn(
                  "block w-full border-b border-sidebar-border px-3 py-3 text-left",
                  matter.id === activeId && "bg-card",
                )}
                onClick={() => selectMatter(matter.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{matterTitle(matter)}</span>
                  {matter.state === "awaiting_approval" ? (
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[11px]">待我确认</span>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {permissionLabel(matter.permission)} · {stateLabel(matter.state)}
                </p>
              </button>
            ))}
            {!loading && visible.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">这个筛选下没有事项。</p>
            ) : null}
          </div>
        </aside>
        <Timeline />
        <Inspector />
      </div>
    </div>
  );
}

function BlankMatter() {
  const createMatter = useMind((s) => s.createMatter);
  const pending = useMind((s) => s.pending);
  const error = useMind((s) => s.error);
  const [draft, setDraft] = useState("");
  const [permission, setPermission] = useState<PermissionPreset>("workspace-write");

  return (
    <section className="bg-background flex min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">新事项</h1>
        <p className="text-muted-foreground mt-1 text-xs">权限在这里选定，创建后只属于这件事，不能再改。</p>
      </div>
      <form
        className="max-w-xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim() || pending) return;
          void createMatter(draft, permission);
        }}
      >
        <Area rows={3} value={draft} placeholder="写下这次要办的事" onChange={(event) => setDraft(event.target.value)} />
        <label className="mt-3 block text-xs">
          权限
          <select
            aria-label="权限预设"
            className="border-input bg-card mt-1 block h-9 rounded-lg border px-2 text-sm"
            value={permission}
            onChange={(event) => setPermission(event.target.value as PermissionPreset)}
          >
            <option value="workspace-write">工作区可写</option>
            <option value="read-only">只读</option>
            <option value="danger-full-access">完全访问</option>
          </select>
        </label>
        {permission === "read-only" ? (
          <p className="text-muted-foreground mt-2 text-xs">只读只作用于这件事：可以查看，不会改文件。</p>
        ) : null}
        {permission === "danger-full-access" ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            完全访问只作用于这件事，会关闭默认审批，仅用于明确授权的受控环境。
          </p>
        ) : null}
        {error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
        <Button className="mt-3" type="submit" disabled={pending === "create"}>
          {pending === "create" ? "正在创建…" : "创建"}
        </Button>
      </form>
    </section>
  );
}

function speaker(role: string) {
  if (role === "user") return "我";
  if (role === "assistant") return "助手";
  return role || "系统";
}

function Timeline() {
  const role = useMind((s) => s.role);
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const messages = useMind((s) => (s.activeId && s.messages[s.activeId]) || emptyMessages);
  const approval = useMind((s) => (s.activeId ? (s.approvals[s.activeId] ?? null) : null));
  const steered = useMind((s) => (s.activeId ? s.steered[s.activeId] === true : false));
  const pending = useMind((s) => s.pending);
  const error = useMind((s) => s.error);
  const send = useMind((s) => s.send);
  const stop = useMind((s) => s.stop);
  const steer = useMind((s) => s.steer);
  const decide = useMind((s) => s.decide);
  const [text, setText] = useState("");
  if (!matter) return <BlankMatter />;
  const continuing = steered || matter.state === "closed";

  return (
    <section className="bg-background flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="text-base font-semibold">{matterTitle(matter)}</h1>
        <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs" title="权限在创建这件事时已经确定">
          {permissionLabel(matter.permission)}
        </span>
        <span className="text-muted-foreground text-xs">{stateLabel(matter.state)}</span>
        {matter.permission === "danger-full-access" ? (
          <p className="text-muted-foreground text-xs">完全访问只作用于这件事，已关闭默认审批。</p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">还没有消息。发送后，这里显示这间房间的真实回复。</p>
        ) : null}
        {messages.map((item) => (
          <article key={item.id} className="max-w-2xl">
            <p className="text-muted-foreground text-xs">{speaker(item.role)}</p>
            <p className="mt-1 text-sm leading-6">{item.text}</p>
          </article>
        ))}
        {approval && approval.status === "pending" ? (
          <div className="bg-card max-w-xl rounded-lg border p-3">
            <p className="text-xs font-semibold">这一次要先确认</p>
            <p className="mt-2 text-sm leading-6">
              {approval.toolName ? `要调用「${approval.toolName}」。` : "助手要做一次需要确认的操作。"}
              {approval.reason ? approval.reason : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled={pending === "decide"} onClick={() => void decide(approval.id, "allow")}>
                允许这一次
              </Button>
              <Button variant="outline" disabled={pending === "decide"} onClick={() => void decide(approval.id, "reject")}>
                拒绝
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
      {role === "经办人" ? (
        <form
          className="border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim() || pending) return;
            const submit = continuing ? steer(text) : send(text);
            void submit.then(() => {
              if (!useMind.getState().error) setText("");
            });
          }}
        >
          <Area
            rows={2}
            value={text}
            placeholder={continuing ? "接着说，会沿着这次的上下文改方向" : "给这个事项发一句话"}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button className="mt-0" type="submit" disabled={pending === "send" || pending === "steer" || matter.state === "awaiting_approval"}>
              {pending === "send" || pending === "steer" ? "发送中…" : continuing ? "接着说" : "发送"}
            </Button>
            {matter.state === "running" || pending === "send" ? (
              <Button type="button" variant="outline" disabled={pending === "abort"} onClick={() => void stop()}>
                {pending === "abort" ? "正在停止…" : "停止"}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-3 text-xs">当前角色只查看这间房间的消息。确认卡仍可点。</p>
      )}
    </section>
  );
}

function activityTitle(event: ActivityEvent) {
  if (event.type === "tool.call") return "工具调用";
  if (event.type === "tool.result") return "工具结果";
  if (event.type === "approval.asked") return "等待批准";
  if (event.type === "agent.started") return "开始";
  if (event.type === "agent.finished") return "结束";
  if (event.type === "room.steered") return "接着说";
  return event.type;
}

function activityBody(event: ActivityEvent) {
  if (event.type === "tool.call" || event.type === "tool.result") {
    return [event.toolName, event.text].filter(Boolean).join(" · ");
  }
  if (event.type === "approval.asked") {
    return [event.toolName, event.reason || event.text].filter(Boolean).join(" · ");
  }
  if (event.type === "agent.started" || event.type === "agent.finished") {
    return [event.role, event.text].filter(Boolean).join(" · ") || "子助手";
  }
  return event.text || event.reason || "";
}

function Inspector() {
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const activity = useMind((s) => (s.activeId && s.activity[s.activeId]) || emptyActivity);
  const approval = useMind((s) => (s.activeId ? (s.approvals[s.activeId] ?? null) : null));
  if (!matter) {
    return <aside className="text-muted-foreground bg-card border-l p-4 text-sm">创建之后，右边显示这次的工具调用和结果。</aside>;
  }
  const shown = activity.filter((event) => event.type !== "usage" && event.type !== "assistant.message" && event.type !== "session.status");
  const waiting = approval && approval.status === "pending" ? approval : null;

  return (
    <aside className="bg-card min-h-0 overflow-auto border-l p-3 text-sm">
      <h2 className="text-xs font-semibold">这次做了什么</h2>
      {waiting ? (
        <p className="bg-primary/10 text-primary mt-2 rounded px-2 py-1.5 text-xs">
          等待批准{waiting.toolName ? ` · ${waiting.toolName}` : ""}
          {waiting.reason ? ` · ${waiting.reason}` : ""}
        </p>
      ) : null}
      {shown.length === 0 ? <p className="text-muted-foreground mt-3 text-xs">这次还没有工具调用或子助手。</p> : null}
      <ol className="mt-3 space-y-3">
        {shown.map((event) => (
          <li key={event.id}>
            <p className="text-xs font-semibold">{activityTitle(event)}</p>
            {activityBody(event) ? <p className="text-muted-foreground mt-1 text-xs leading-5">{activityBody(event)}</p> : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}
