import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { matterTitle, permissionLabel, stateLabel, type PermissionPreset } from "../model";
import { useMind } from "../store";
import { Area, Button } from "../ui";
import { cn } from "../lib/cn";
import type { ActivityEvent, ChatMessage } from "../lib/rooms";
import { publishFileShare } from "../lib/shares";
import { getPublishedApps, subscribePublishedApps } from "../lib/publishedApps";
import { getUiPrefs, setUiPrefs, subscribeUiPrefs } from "../lib/uiPrefs";
import { chordFromEvent, getShortcuts, isShortcutCapture } from "../lib/shortcuts";
import { ModelPicker } from "./ModelPicker";
import { ShareTaskDialog } from "./ShareTaskDialog";
import { AppMenu } from "./AppMenu";
import { CreateFailureNotice } from "./CreateFailureNotice";

const emptyMessages: ChatMessage[] = [];
const emptyActivity: ActivityEvent[] = [];

const RAIL_TABS = ["产物", "概览", "任务进程", "文件"] as const;
type RailTab = (typeof RAIL_TABS)[number];

export function WorkbenchPage() {
  const loadRooms = useMind((s) => s.loadRooms);
  const [railOpen, setRailOpen] = useState(true);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);
  useEffect(() => {
    function onToggle() {
      setRailOpen((open) => !open);
    }
    window.addEventListener("mind-toggle-rail", onToggle);
    return () => window.removeEventListener("mind-toggle-rail", onToggle);
  }, []);

  return (
    <div className={cn("grid min-h-0 flex-1", railOpen ? "grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-[minmax(0,1fr)]")}>
      <Timeline railOpen={railOpen} onToggleRail={() => setRailOpen((open) => !open)} />
      {railOpen ? <Inspector /> : null}
    </div>
  );
}

function BlankMatter() {
  const createMatter = useMind((s) => s.createMatter);
  const pending = useMind((s) => s.pending);
  const createError = useMind((s) => s.createError);
  const [draft, setDraft] = useState("");
  const [permission, setPermission] = useState<PermissionPreset>("workspace-write");

  function submit() {
    if (!draft.trim() || pending === "create") return;
    void createMatter(draft, permission).then((result) => {
      if (result.createdId) setDraft("");
    });
  }

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
          submit();
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
              {pending === "create" ? "正在准备执行" : "发送"}
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
          {pending === "create" ? <p className="text-muted-foreground mt-2 text-xs">Agent 正在接手并进入工作状态。</p> : null}
          {createError ? (
            <CreateFailureNotice alert={createError} retryDisabled={pending === "create" || !draft.trim()} onRetry={submit} />
          ) : null}
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把命中的原文包进高亮。当前这一条用更深的底色，方便和其余命中区分。 */
function markedText(text: string, query: string, active: boolean) {
  const needle = query.trim();
  if (!needle || !text.includes(needle)) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "g"));
  return parts.map((part, index) =>
    part === needle ? (
      <mark key={index} className={active ? "bg-[#ffe08a]" : "bg-[#fff3c4]"}>
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
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
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  const steer = useMind((s) => s.steer);
  const decide = useMind((s) => s.decide);
  const [params] = useSearchParams();
  const attachedFile = params.get("file");
  const [text, setText] = useState(attachedFile ?? "");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [model, setModel] = useState("Auto");
  const [modelNotice, setModelNotice] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [collabOpen, setCollabOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const team = ["合规", "财务"];
  const findRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const taskIdRef = useRef(matter?.id);
  const findNeedle = findText.trim();
  const findHits = messages.filter((item) => findNeedle && item.text.includes(findNeedle));
  const currentHitId = findHits.length === 0 ? null : findHits[findIndex % findHits.length]?.id ?? null;
  useEffect(() => {
    setText(attachedFile ?? "");
  }, [matter?.id, attachedFile]);
  useEffect(() => {
    function onSend() {
      composerRef.current?.requestSubmit();
    }
    function onNewline() {
      const area = composerRef.current?.querySelector("textarea");
      if (!(area instanceof HTMLTextAreaElement) || document.activeElement !== area) return;
      const start = area.selectionStart;
      const next = `${area.value.slice(0, start)}\n${area.value.slice(area.selectionEnd)}`;
      setText(next);
      requestAnimationFrame(() => {
        area.focus();
        area.selectionStart = area.selectionEnd = start + 1;
      });
    }
    function onVoice() {
      setVoiceNotice("当前环境不支持语音输入。");
    }
    window.addEventListener("mind-send-message", onSend);
    window.addEventListener("mind-insert-newline", onNewline);
    window.addEventListener("mind-toggle-voice", onVoice);
    return () => {
      window.removeEventListener("mind-send-message", onSend);
      window.removeEventListener("mind-insert-newline", onNewline);
      window.removeEventListener("mind-toggle-voice", onVoice);
    };
  }, []);
  useEffect(() => {
    const nextId = matter?.id;
    const previousId = taskIdRef.current;
    taskIdRef.current = nextId;
    if (!previousId || !nextId || previousId === nextId) return;
    setCollabOpen(false);
    setInviteOpen(false);
    setQueue([]);
    setEditingId(null);
  }, [matter?.id]);
  const draining = useRef(false);
  useEffect(() => {
    if (pending || editingId || matter?.state === "running" || queue.length === 0 || draining.current) return;
    const next = queue[0];
    draining.current = true;
    setQueue((items) => items.filter((item) => item.id !== next.id));
    void send(next.text).finally(() => {
      draining.current = false;
    });
  }, [pending, editingId, matter?.state, queue, send]);
  useEffect(() => {
    if (findOpen) findRef.current?.focus();
  }, [findOpen]);
  useEffect(() => {
    if (!currentHitId) return;
    document.querySelector(`[data-message-id="${currentHitId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentHitId, findNeedle]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isShortcutCapture()) return;
      const chord = chordFromEvent(event);
      const assigned = getShortcuts().find((item) => item.command === "对话内搜索")?.keys;
      const assignedHit = Boolean(chord && assigned && chord === assigned);
      const labeledFind = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f";
      if (!assignedHit && !labeledFind) return;
      event.preventDefault();
      setFindOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function stepFind(delta: number) {
    if (findHits.length === 0) return;
    setFindIndex((current) => (current + delta + findHits.length) % findHits.length);
  }
  function sendQueued(id: string) {
    const picked = queue.find((item) => item.id === id);
    if (!picked) return;
    if (pending || matter?.state === "running") {
      setQueue((items) => [picked, ...items.filter((item) => item.id !== id)]);
      return;
    }
    setQueue((items) => items.filter((item) => item.id !== id));
    void send(picked.text);
  }
  if (!matter) return <BlankMatter />;
  const continuing = steered || matter.state === "closed";

  return (
    <section className="bg-background flex min-h-0 flex-col">
      <div className="relative flex items-center gap-3 border-b px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{matterTitle(matter)}</h1>
        <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs" title="权限在创建这件任务时已经确定">
          {permissionLabel(matter.permission)}
        </span>
        <span className="text-muted-foreground text-xs">{stateLabel(matter.state)}</span>
        <TaskMenu matterId={matter.id} running={matter.state === "running"} title={matter.title} />
        <button type="button" className="text-xs text-[#666]" onClick={() => setCollabOpen((open) => !open)}>
          协作
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-not-allowed text-xs text-[#b0b0b0] disabled:cursor-not-allowed"
        >
          流转 · 未接入
        </button>
        <button
          type="button"
          title="对话内搜索（⌘F / Ctrl+F）"
          aria-label="对话内搜索（⌘F / Ctrl+F）"
          className="text-xs text-[#666]"
          onClick={() => setFindOpen(true)}
        >
          搜索
        </button>
        <button className="text-xs text-[#666]" onClick={onToggleRail}>
          {railOpen ? "隐藏侧边栏" : "显示侧边栏"}
        </button>
      </div>
      {findOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
          <input
            ref={findRef}
            aria-label="搜索对话内容"
            placeholder="搜索对话内容"
            value={findText}
            className="h-8 min-w-0 flex-1 rounded-lg border border-[#e6e6e8] px-2 text-sm"
            onChange={(event) => {
              setFindText(event.target.value);
              setFindIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setFindOpen(false);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                stepFind(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <button type="button" onClick={() => stepFind(-1)}>上一个（Shift+Enter）</button>
          <button type="button" onClick={() => stepFind(1)}>下一个（Enter）</button>
          <button type="button" onClick={() => setFindOpen(false)}>关闭搜索（Esc）</button>
          {findNeedle && findHits.length === 0 ? <span className="text-[#888]">未找到匹配内容</span> : null}
        </div>
      ) : null}
      {collabOpen ? (
        <div className="border-b px-4 py-3 text-sm">
          <p className="font-medium">任务协作成员 · 1</p>
          <p className="mt-1 text-xs text-[#888]">已加入协作 · 0</p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <span>经办人</span>
              <span className="text-xs text-[#888]">所有者</span>
            </li>
          </ul>
          <div className="mt-3 flex gap-2 text-xs">
            <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => setInviteOpen(true)}>
              邀请
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="cursor-not-allowed rounded-lg border border-[#e6e6e8] bg-[#f3f3f4] px-3 py-1.5 text-[#b0b0b0] disabled:cursor-not-allowed"
            >
              复制链接 · 未接入
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">还没有消息。发送后，这里显示这件云端任务的真实回复。</p>
        ) : null}
        {messages.map((item) => (
          <article key={item.id} data-message-id={item.id} className="max-w-2xl">
            <p className="text-muted-foreground text-xs">{speaker(item.role)}</p>
            <p className="mt-1 text-sm leading-6">{markedText(item.text, findOpen ? findText : "", item.id === currentHitId)}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#666]">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(item.text);
                  setCopiedId(item.id);
                }}
              >
                {copiedId === item.id ? "已复制" : "复制 message"}
              </button>
              {item.role === "assistant" ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="cursor-not-allowed text-[#b0b0b0] disabled:cursor-not-allowed"
                >
                  提交反馈 · 未接入
                </button>
              ) : null}
            </div>
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
      {queue.length > 0 ? (
        <div className="border-t px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <button type="button" className="font-medium" onClick={() => setQueueOpen(true)}>队列中</button>
            {queueOpen ? (
              <button type="button" className="ml-auto text-xs text-[#666]" onClick={() => setQueueOpen(false)}>收起队列</button>
            ) : null}
          </div>
          {queueOpen ? (
            <ul className="mt-2 space-y-2">
              {queue.map((item) => (
                <li key={item.id}>
                  <p>{`我的：${item.text}`}</p>
                  <div className="mt-1 flex gap-2 text-xs text-[#666]">
                    <button type="button" onClick={() => { setEditingId(item.id); setEditText(item.text); }}>编辑</button>
                    <button type="button" onClick={() => setQueue((items) => items.filter((entry) => entry.id !== item.id))}>删除</button>
                    <button type="button" onClick={() => sendQueued(item.id)}>立刻发送</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {role === "经办人" ? (
        <form
          ref={composerRef}
          className="relative z-30 border-t bg-[#f7f7f8] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) return;
            if (pending || matter.state === "running") {
              setQueue((items) => [...items, { id: `q-${Date.now()}`, text: trimmed }]);
              setQueueOpen(true);
              setText("");
              return;
            }
            const submit = continuing ? steer(trimmed) : send(trimmed);
            void submit.then(() => {
              if (!useMind.getState().error) setText("");
            });
          }}
        >
          <div className="bg-card rounded-xl border p-3">
            <TaskComposerExtras matterId={matter.id} text={text} setText={setText} />
            <ComposerSuggest text={text} setText={setText} />
            {attachedFile ? <p className="mb-2 text-xs text-[#666]">已添加到任务 · {attachedFile}</p> : null}
            <Area
              rows={2}
              value={text}
              placeholder="今天帮你做些什么？ @ 添加上下文，/调用技能与指令"
              onChange={(event) => setText(event.target.value)}
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-[#666]">
              <button type="button" className="rounded-md px-1 py-1 hover:bg-[#f3f3f4]" onClick={() => setVoiceNotice("当前环境不支持语音输入。")}>
                语音输入
              </button>
              <span className="rounded-md px-1 py-1">云端工作空间</span>
              <ModelPicker
                value={model}
                onChange={(next) => {
                  if (next !== model) setModelNotice(`模型已从 ${model} 更改为 ${next}`);
                  setModel(next);
                }}
              />
              {model !== "Auto" ? <span>使用外部模型，注意数据安全</span> : null}
              {modelNotice ? <span title="在对话中途切换模型会使上下文缓存失效，积分消耗增加，背景信息可能会自动压缩，降低性能表现">{modelNotice}</span> : null}
              <span className="rounded-md px-1 py-1" title="权限在创建这件任务时已经确定">
                {matter.permission === "danger-full-access" ? "允许完全访问" : matter.permission === "read-only" ? "云端只读" : "默认权限"}
              </span>
              <div className="ml-auto flex items-center gap-2">
              {matter.state === "running" || pending === "send" ? (
                <Button type="button" variant="outline" disabled={pending === "abort"} onClick={() => void stop()}>
                  {pending === "abort" ? "正在停止…" : "停止"}
                </Button>
              ) : null}
              <Button type="submit" disabled={matter.state === "awaiting_approval" || !text.trim()}>
                {pending === "send" || pending === "steer" ? "发送中…" : continuing ? "接着说" : "发送"}
              </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-3 text-xs">当前角色只查看这件任务的消息。确认卡仍可点。</p>
      )}
      {voiceNotice ? <p className="border-t px-3 py-2 text-xs text-[#666]">{voiceNotice}</p> : null}
      {pending === "send" && uiPrefs.welcome ? (
        <p className="flex items-center gap-3 border-t px-3 py-2 text-xs text-[#666]">
          <span>思考中</span>
          <button type="button" className="text-[#888]" onClick={() => setUiPrefs({ welcome: false })}>不再显示</button>
        </p>
      ) : null}
      {inviteOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="邀请团队成员协作">
            <p className="font-medium">邀请团队成员协作</p>
            <p className="mt-2 text-xs text-[#888]">非项目成员申请加入后方可进入协作</p>
            <ul className="mt-3 space-y-2">
              {team.map((name) => (
                <li key={name} className="flex items-center gap-2">
                  <span>{name}</span>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="ml-auto cursor-not-allowed text-[#b0b0b0] disabled:cursor-not-allowed"
                  >
                    邀请 · 未接入
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-4 text-xs text-[#666]" onClick={() => setInviteOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {editingId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="编辑">
            <p className="font-medium">编辑</p>
            <textarea aria-label="编辑" className="mt-3 w-full rounded-lg border border-[#e6e6e8] px-3 py-2" rows={3} value={editText} onChange={(event) => setEditText(event.target.value)} />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingId(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  const id = editingId;
                  setQueue((items) => items.map((item) => (item.id === id ? { ...item, text: editText } : item)));
                  setEditingId(null);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  const [tab, setTab] = useState<RailTab>("产物");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followed, setFollowed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const items: { id: string; name: string; kind: string; body: string }[] = [];
  const selected = items.find((item) => item.id === selectedId) ?? null;
  if (!matter) {
    return (
      <aside className="text-muted-foreground bg-card border-l p-4 text-sm">
        创建之后，右边是这件云端任务的产物和文件。文件不在你的电脑上。
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
        {tab === "任务进程" ? (
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
        ) : tab === "概览" ? (
          <div>
            <p className="text-sm font-medium">{matterTitle(matter)}</p>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              {stateLabel(matter.state)} · {permissionLabel(matter.permission)}
            </p>
          </div>
        ) : (
          <ArtifactPane
            tab={tab === "文件" ? "文件" : "产物"}
            items={items}
            selected={selected}
            followed={followed}
            shareOpen={shareOpen}
            copied={copied}
            notice={notice}
            onSelect={(id) => {
              setSelectedId(id);
              setTab("产物");
              setShareOpen(false);
              setCopied(false);
            }}
            onFollow={() => setFollowed((value) => !value)}
            onReview={() => setNotice("审查")}
            onShare={() => {
              setShareOpen(true);
              setCopied(false);
            }}
            onCopy={() => {
              if (!selected) return;
              publishFileShare({ matterId: matter.id, taskTitle: matter.title, fileId: selected.id, name: selected.name });
              const link = `${location.origin}/task/${matter.id}?file=${encodeURIComponent(selected.name)}`;
              void navigator.clipboard.writeText(link).finally(() => setCopied(true));
            }}
            onCloseShare={() => setShareOpen(false)}
          />
        )}
      </div>
    </aside>
  );
}

function ArtifactPane({
  tab,
  items,
  selected,
  followed,
  shareOpen,
  copied,
  notice,
  onSelect,
  onFollow,
  onReview,
  onShare,
  onCopy,
  onCloseShare,
}: {
  tab: "产物" | "文件";
  items: { id: string; name: string; kind: string; body: string }[];
  selected: { id: string; name: string; kind: string; body: string } | null;
  followed: boolean;
  shareOpen: boolean;
  copied: boolean;
  notice: string | null;
  onSelect: (id: string) => void;
  onFollow: () => void;
  onReview: () => void;
  onShare: () => void;
  onCopy: () => void;
  onCloseShare: () => void;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-xs leading-5">{tab === "产物" ? "请选择一个产物查看详情" : "暂无内容"}</p>;
  }
  if (tab === "文件" || !selected) {
    return (
      <div>
        {tab === "产物" && !selected ? <p className="text-muted-foreground mb-2 text-xs">请选择一个产物查看详情</p> : null}
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="w-full rounded-lg px-2 py-2 text-left hover:bg-[#f6f6f7]" onClick={() => onSelect(item.id)}>
                <span className="text-xs text-[#999]">{item.kind}</span>
                <span className="mt-1 block text-sm">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {notice ? <p className="text-muted-foreground mt-3 text-xs">{notice}</p> : null}
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="text-xs text-[#666]" onClick={() => onSelect("")}>
        产物
      </button>
      <p className="mt-2 text-sm font-medium">{selected.name}</p>
      <p className="text-muted-foreground mt-1 text-xs">{selected.kind}</p>
      <p className="mt-3 text-sm leading-6">{notice === "审查" ? selected.body : selected.body}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded-lg bg-[#f3f3f4] px-2 py-1" aria-pressed={followed} onClick={onFollow}>
          关注
        </button>
        <button type="button" className="rounded-lg bg-[#f3f3f4] px-2 py-1" onClick={onReview}>
          审查
        </button>
        <button type="button" className="rounded-lg bg-[#f3f3f4] px-2 py-1" onClick={onShare}>
          分享
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-not-allowed rounded-lg bg-[#f3f3f4] px-2 py-1 text-[#b0b0b0] disabled:cursor-not-allowed"
        >
          下载 · 未接入
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-not-allowed rounded-lg bg-[#f3f3f4] px-2 py-1 text-[#b0b0b0] disabled:cursor-not-allowed"
        >
          发布 · 未接入
        </button>
      </div>
      {shareOpen ? (
        <div className="mt-3 rounded-xl border border-[#ececee] p-3 text-xs">
          <p className="font-medium">分享</p>
          <p className="text-muted-foreground mt-1">任何有此链接的人都能查看</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onCloseShare}>取消</button>
            <button type="button" className="rounded-lg bg-[#1a1a1a] px-2 py-1 text-white" onClick={onCopy}>
              {copied ? "链接已复制到剪贴板" : "复制链接"}
            </button>
          </div>
        </div>
      ) : null}
      {notice && notice !== "审查" ? <p className="text-muted-foreground mt-3 text-xs">{notice}</p> : null}
    </div>
  );
}

const ADD_ITEMS = ["添加文件", "引用对话中的文件", "应用", "模式", "专家", "技能", "连接器"] as const;

function TaskComposerExtras({ matterId, text, setText }: { matterId: string; text: string; setText: (value: string) => void }) {
  const catalog = useMind((s) => s.catalog);
  const [addOpen, setAddOpen] = useState(false);
  const [addPanel, setAddPanel] = useState<(typeof ADD_ITEMS)[number] | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const sessionFiles: { id: string; name: string }[] = [];
  const cloudFiles: { name: string }[] = [];

  function attach(label: string) {
    setText(text.includes(label) ? text : `${label}${text ? ` ${text}` : ""}`);
    setAddOpen(false);
    setAddPanel(null);
  }

  return (
    <div className="relative mb-2">
      <button
        type="button"
        aria-label="更多操作"
        aria-expanded={addOpen}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-[#f3f3f4]"
        onClick={() => {
          setAddOpen((open) => !open);
          setAddPanel(null);
        }}
      >
        +
      </button>
      {addOpen ? (
        <div className="absolute bottom-10 left-0 z-20 w-52 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
          {ADD_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
              onClick={() => {
                if (item === "添加文件") {
                  setCloudOpen(true);
                  setAddOpen(false);
                  setAddPanel(null);
                  return;
                }
                setAddPanel(item);
              }}
            >
              {item}
            </button>
          ))}
          {addPanel === "专家" ? <MiniList items={catalog.agents.map((item) => item.name)} empty="暂无可用专家" onPick={(name) => attach(`@${name}`)} /> : null}
          {addPanel === "技能" ? <MiniList items={catalog.skills.map((item) => item.name)} empty="暂无可用技能" onPick={(name) => attach(`/${name}`)} /> : null}
          {addPanel === "连接器" ? <MiniList items={catalog.mcps.map((item) => item.name)} empty="暂无可用连接器" onPick={(name) => attach(name)} /> : null}
          {addPanel === "模式" ? <MiniList items={["计划", "仅问答"]} empty="" onPick={(name) => attach(name)} /> : null}
          {addPanel === "应用" ? (
            <AppMenu
              matterId={matterId}
              onPick={(app) => attach(app.name)}
            />
          ) : null}
          {addPanel === "引用对话中的文件" ? (
            <div className="border-t border-[#f0f0f1] px-1 py-1">
              <p className="px-2 py-1 text-xs text-[#999]">对话中的文件</p>
              {sessionFiles.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">当前对话中暂无文件</p> : null}
              {sessionFiles.map((file) => (
                <button key={file.id} type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={() => attach(file.name)}>
                  {file.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {cloudOpen ? (
        <CloudFileDialog
          files={cloudFiles.map((file) => file.name)}
          onClose={() => setCloudOpen(false)}
          onAdd={(name) => {
            attach(name);
            setCloudOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function CloudFileDialog({ files, onClose, onAdd }: { files: string[]; onClose: () => void; onAdd: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const needle = query.trim();
  const visible = files.filter((name) => !needle || name.includes(needle));
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="从我的云端网盘中选择">
        <p className="font-medium">从我的云端网盘中选择</p>
        <input
          aria-label="搜索文件名"
          placeholder="搜索文件名"
          className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {visible.length === 0 ? <p className="mt-3 text-[#888]">{needle ? "没有找到匹配的文件" : "文件夹为空"}</p> : null}
        <ul className="mt-3 max-h-48 space-y-1 overflow-auto">
          {visible.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={cn("block w-full rounded-lg px-2 py-1.5 text-left", picked === name ? "bg-[#ececee]" : "hover:bg-[#f6f6f7]")}
                onClick={() => setPicked(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={!picked} onClick={() => picked && onAdd(picked)}>
            添加到任务
          </button>
        </div>
      </div>
    </div>
  );
}

function readToken(text: string) {
  const mention = text.match(/(?:^|\s)@([^\s@]*)$/);
  if (mention) return { kind: "mention" as const, query: mention[1] };
  const slash = text.match(/(?:^|\s)\/([^\s/]*)$/);
  if (slash) return { kind: "slash" as const, query: slash[1] };
  return null;
}

function applyToken(text: string, kind: "mention" | "slash", insertion: string) {
  const pattern = kind === "mention" ? /(?:^|\s)@[^\s@]*$/ : /(?:^|\s)\/[^\s/]*$/;
  return text.replace(pattern, (chunk) => `${/^\s/.test(chunk) ? chunk[0] : ""}${insertion}`);
}

export function ComposerSuggest({ text, setText }: { text: string; setText: (value: string) => void }) {
  const catalog = useMind((s) => s.catalog);
  const apps = useSyncExternalStore(subscribePublishedApps, getPublishedApps, getPublishedApps);
  const token = readToken(text);
  useEffect(() => {
    function openMention() {
      if (readToken(text)?.kind === "mention") return;
      setText(`${text}@`);
    }
    function openSlash() {
      if (readToken(text)?.kind === "slash") return;
      setText(`${text}/`);
    }
    window.addEventListener("mind-open-mention", openMention);
    window.addEventListener("mind-open-slash", openSlash);
    return () => {
      window.removeEventListener("mind-open-mention", openMention);
      window.removeEventListener("mind-open-slash", openSlash);
    };
  }, [text, setText]);
  if (!token) return null;
  const query = token.query.trim();
  const visibleApps = apps.filter((app) => !query || app.name.includes(query));
  const agents = catalog.agents.filter((agent) => !query || agent.name.includes(query));
  const skills = catalog.skills.filter((skill) => !query || skill.name.includes(query));
  function pick(insertion: string) {
    if (!token) return;
    setText(`${applyToken(text, token.kind, insertion)} `);
  }
  return (
    <div className="relative z-20 h-0">
    <div className="absolute bottom-full left-0 z-20 mb-8 w-72 rounded-xl border border-[#ececee] bg-white p-2 text-sm shadow-lg" role="listbox" aria-label={token.kind === "mention" ? "唤起选择器" : "唤起斜杠命令"}>
      {token.kind === "mention" ? (
        <>
          <p className="px-2 py-1 text-xs text-[#888]">选择文件和文件夹</p>
          <p className="px-2 py-1 text-xs text-[#999]">对话中的文件</p>
          <p className="px-2 pb-1 text-xs text-[#999]">添加文件作为回答背景</p>
          <p className="px-2 py-1 text-xs text-[#888]">当前对话中暂无文件</p>
          <p className="mt-1 px-2 py-1 text-xs text-[#888]">应用</p>
          {apps.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">当前暂无可选应用</p> : null}
          {apps.length > 0 && visibleApps.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">无搜索结果</p> : null}
          {visibleApps.map((app) => (
            <button key={app.id} type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => pick(app.name)}>
              {app.name}
            </button>
          ))}
          <p className="mt-1 px-2 py-1 text-xs text-[#888]">助理</p>
          <p className="px-2 pb-1 text-xs text-[#999]">选择助理协同推进任务</p>
          {agents.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">未找到助理</p> : null}
          {agents.map((agent) => (
            <button key={agent.id} type="button" className="flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => pick(`@${agent.name}`)}>
              <span>{agent.name}</span>
              <span className="ml-auto text-xs text-[#888]">空闲</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <p className="px-2 py-1 text-xs text-[#888]">技能</p>
          {catalog.skills.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">暂无可用技能</p> : null}
          {catalog.skills.length > 0 && skills.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">未找到技能</p> : null}
          {skills.map((skill) => (
            <button key={skill.id} type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => pick(`/${skill.name}`)}>
              {skill.name}
            </button>
          ))}
        </>
      )}
    </div>
    </div>
  );
}

function MiniList({ items, empty, onPick }: { items: string[]; empty: string; onPick: (name: string) => void }) {
  if (items.length === 0) return <p className="px-3 py-2 text-xs text-[#888]">{empty}</p>;
  return (
    <ul className="max-h-36 overflow-auto border-t border-[#f0f0f1] px-1 py-1">
      {items.map((item) => (
        <li key={item}>
          <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={() => onPick(item)}>
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskMenu({ matterId, running, title }: { matterId: string; running: boolean; title: string }) {
  const navigate = useNavigate();
  const renameMatter = useMind((s) => s.renameMatter);
  const archiveMatter = useMind((s) => s.archiveMatter);
  const removeMatter = useMind((s) => s.removeMatter);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "share" | "archive" | "delete" | null>(null);
  const [renameValue, setRenameValue] = useState(title);

  return (
    <>
      <button type="button" aria-label="任务操作" aria-expanded={open} className="text-xs text-[#666]" onClick={() => setOpen((value) => !value)}>
        更多
      </button>
      {open ? (
        <div className="absolute right-16 top-12 z-20 w-36 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
          <MenuButton label="重命名" onClick={() => { setRenameValue(title); setDialog("rename"); setOpen(false); }} />
          <MenuButton label="分享任务" onClick={() => { setDialog("share"); setOpen(false); }} />
          <MenuButton label="归档任务" disabled={running} title={running ? "任务进行中，无法归档" : undefined} onClick={() => { setDialog("archive"); setOpen(false); }} />
          <MenuButton label="删除任务" onClick={() => { setDialog("delete"); setOpen(false); }} />
        </div>
      ) : null}
      {dialog === "rename" ? (
        <Overlay>
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              renameMatter(matterId, renameValue);
              setDialog(null);
            }}
          >
            <p className="font-medium">重命名任务</p>
            <p className="mt-2 text-xs text-[#888]">原名称：{title}</p>
            <input aria-label="任务名称" value={renameValue} className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm" onChange={(event) => setRenameValue(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white">保存</button>
            </div>
          </form>
        </Overlay>
      ) : null}
      {dialog === "share" ? (
        <Overlay>
          <ShareTaskDialog matterId={matterId} title={title} onClose={() => setDialog(null)} />
        </Overlay>
      ) : null}
      {dialog === "archive" ? (
        <Overlay>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">归档任务</p>
            <p className="mt-2 text-[#666]">确认将该任务归档吗？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => { archiveMatter(matterId); navigate("/"); }}>确认归档</button>
            </div>
          </div>
        </Overlay>
      ) : null}
      {dialog === "delete" ? (
        <Overlay>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">删除任务</p>
            <p className="mt-2 text-[#666]">确认后将从列表中删除任务，请确认是否删除？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => { removeMatter(matterId); navigate("/"); }}>确认删除</button>
            </div>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}

function MenuButton({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" disabled={disabled} title={title} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7] disabled:opacity-40" onClick={onClick}>
      {label}
    </button>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">{children}</div>;
}
