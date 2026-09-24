import { useEffect, useState } from "react";
import { FILTERS, matterTitle, permissionLabel, stateLabel, type FilterId, type PermissionPreset } from "../model";
import { useMind } from "../store";
import { Area, Button, Field } from "../ui";
import { cn } from "../lib/cn";
import type { ActivityEvent, ChatMessage } from "../lib/rooms";

const emptyMessages: ChatMessage[] = [];
const emptyActivity: ActivityEvent[] = [];

const RAIL_TABS = ["轨迹", "产物", "全部文件", "变更", "预览"] as const;
type RailTab = (typeof RAIL_TABS)[number];

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
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(true);

  const needle = query.trim();
  const visible = matters.filter((matter) => {
    if (needle && !matterTitle(matter).includes(needle)) return false;
    if (filter === "已完成") return matter.state === "closed";
    if (filter === "待我确认") return matter.state === "awaiting_approval";
    return matter.state !== "closed";
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("grid min-h-0 flex-1", railOpen ? "grid-cols-[280px_minmax(0,1fr)_360px]" : "grid-cols-[280px_minmax(0,1fr)]")}>
        <aside className="bg-sidebar flex min-h-0 flex-col border-r border-sidebar-border">
          <div className="border-b border-sidebar-border p-3">
            <p className="text-muted-foreground mb-2 text-[11px]">云端任务。每件任务各自一份云端空间，不读你电脑上的文件夹。</p>
            {role === "经办人" ? (
              <Button className="w-full" variant={activeId === null ? "primary" : "outline"} onClick={startBlank}>
                新建任务
              </Button>
            ) : null}
            <Field className="mt-2" value={query} placeholder="搜索任务" aria-label="搜索任务" onChange={(event) => setQuery(event.target.value)} />
          </div>
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
            {loading && matters.length === 0 ? <p className="text-muted-foreground p-4 text-sm">正在读取任务…</p> : null}
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
                  云端 · {permissionLabel(matter.permission)} · {stateLabel(matter.state)}
                </p>
              </button>
            ))}
            {!loading && visible.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">这个筛选下没有任务。</p>
            ) : null}
          </div>
        </aside>
        <Timeline railOpen={railOpen} onToggleRail={() => setRailOpen((open) => !open)} />
        {railOpen ? <Inspector /> : null}
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
        <h1 className="text-base font-semibold">新建任务</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          不用选本机目录。创建后这件任务独占一块云端空间，权限只属于它，不能再改。
        </p>
      </div>
      <form
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim() || pending) return;
          void createMatter(draft, permission);
        }}
      >
        <div className="bg-card rounded-xl border p-3 shadow-sm">
          <Area rows={3} value={draft} placeholder="写下这次要办的事" onChange={(event) => setDraft(event.target.value)} />
          <div className="mt-3 flex items-end justify-between gap-3">
            <label className="text-xs">
              这件任务的云端权限
              <select
                aria-label="权限预设"
                className="border-input bg-card mt-1 block h-9 rounded-lg border px-2 text-sm"
                value={permission}
                onChange={(event) => setPermission(event.target.value as PermissionPreset)}
              >
                <option value="workspace-write">云端可写</option>
                <option value="read-only">云端只读</option>
                <option value="danger-full-access">完全访问</option>
              </select>
            </label>
            <Button type="submit" disabled={pending === "create"}>
              {pending === "create" ? "正在创建…" : "发送"}
            </Button>
          </div>
          {permission === "read-only" ? (
            <p className="text-muted-foreground mt-2 text-xs">云端只读只作用于这件事：可以查看，不会改云端文件。</p>
          ) : null}
          {permission === "danger-full-access" ? (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              完全访问只作用于这件云端任务，会关闭默认审批。它不是整个客户端的开关。
            </p>
          ) : null}
          {error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}

function speaker(role: string) {
  if (role === "user") return "我";
  if (role === "assistant") return "助手";
  return role || "系统";
}

function Timeline({ railOpen, onToggleRail }: { railOpen: boolean; onToggleRail: () => void }) {
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
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{matterTitle(matter)}</h1>
        <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs" title="权限在创建这件任务时已经确定">
          {permissionLabel(matter.permission)}
        </span>
        <span className="text-muted-foreground text-xs">{stateLabel(matter.state)}</span>
        <button className="text-primary text-xs" onClick={onToggleRail}>
          {railOpen ? "收起详情" : "打开详情"}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">还没有消息。发送后，这里显示这件云端任务的真实回复。</p>
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
          <div className="bg-card rounded-xl border p-3">
            <Area
              rows={2}
              value={text}
              placeholder={continuing ? "接着说，会沿着这件云端任务改方向" : "给这件云端任务发一句话"}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <p className="text-muted-foreground mr-auto text-[11px]">直接做。运行时没有单独的计划模式，所以这里不能先计划。</p>
              {matter.state === "running" || pending === "send" ? (
                <Button type="button" variant="outline" disabled={pending === "abort"} onClick={() => void stop()}>
                  {pending === "abort" ? "正在停止…" : "停止"}
                </Button>
              ) : null}
              <Button type="submit" disabled={pending === "send" || pending === "steer" || matter.state === "awaiting_approval"}>
                {pending === "send" || pending === "steer" ? "发送中…" : continuing ? "接着说" : "发送"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-3 text-xs">当前角色只查看这件任务的消息。确认卡仍可点。</p>
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
  const [tab, setTab] = useState<RailTab>("轨迹");
  if (!matter) {
    return (
      <aside className="text-muted-foreground bg-card border-l p-4 text-sm">
        创建之后，右边是这件云端任务的轨迹和文件。文件不在你的电脑上。
      </aside>
    );
  }
  const shown = activity.filter((event) => event.type !== "usage" && event.type !== "assistant.message" && event.type !== "session.status");
  const waiting = approval && approval.status === "pending" ? approval : null;

  return (
    <aside className="bg-card flex min-h-0 flex-col border-l text-sm">
      <div className="flex gap-1 overflow-auto border-b px-2 py-2 text-xs">
        {RAIL_TABS.map((item) => (
          <button
            key={item}
            className={cn("rounded-md px-2 py-1", tab === item ? "bg-accent text-accent-foreground" : "text-muted-foreground")}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === "轨迹" ? (
          <>
            {waiting ? (
              <p className="bg-primary/10 text-primary mb-3 rounded px-2 py-1.5 text-xs">
                等待批准{waiting.toolName ? ` · ${waiting.toolName}` : ""}
                {waiting.reason ? ` · ${waiting.reason}` : ""}
              </p>
            ) : null}
            {shown.length === 0 ? <p className="text-muted-foreground text-xs">这次还没有工具调用或子助手。</p> : null}
            <ol className="space-y-3">
              {shown.map((event) => (
                <li key={event.id}>
                  <p className="text-xs font-semibold">{activityTitle(event)}</p>
                  {activityBody(event) ? <p className="text-muted-foreground mt-1 text-xs leading-5">{activityBody(event)}</p> : null}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <CloudEmpty tab={tab} />
        )}
      </div>
    </aside>
  );
}

function CloudEmpty({ tab }: { tab: Exclude<RailTab, "轨迹"> }) {
  const detail =
    tab === "产物"
      ? "产物会放在这件任务的云端空间里。"
      : tab === "全部文件"
        ? "全部文件都在云端，没有本机目录可以打开。"
        : tab === "变更"
          ? "变更记录的是云端文件，不是你磁盘上的差异。"
          : "预览要等云端文件出现之后才能看。这里没有内置的本机浏览器。";
  return (
    <div>
      <p className="text-sm font-medium">{tab}</p>
      <p className="text-muted-foreground mt-2 text-xs leading-5">{detail}控制面还没有文件接口，所以这里是空的。</p>
    </div>
  );
}
