import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FILTERS, findDoc, matterTitle, permissionLabel, stateLabel, type FilterId, type PermissionPreset } from "../model";
import { useMind } from "../store";
import { Area, Button } from "../ui";
import { cn } from "../lib/cn";
import type { ChatMessage } from "../lib/rooms";

const emptyMessages: ChatMessage[] = [];

export function WorkbenchPage() {
  const loadRooms = useMind((s) => s.loadRooms);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const navigate = useNavigate();
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
        <Inspector onOpenCatalog={() => navigate("/capabilities")} />
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
  const pending = useMind((s) => s.pending);
  const error = useMind((s) => s.error);
  const send = useMind((s) => s.send);
  const [text, setText] = useState("");
  if (!matter) return <BlankMatter />;

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
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
      {role === "经办人" ? (
        <form
          className="border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim() || pending) return;
            void send(text).then(() => {
              if (!useMind.getState().error) setText("");
            });
          }}
        >
          <Area rows={2} value={text} placeholder="给这个事项发一句话" onChange={(event) => setText(event.target.value)} />
          <Button className="mt-2" type="submit" disabled={pending === "send" || matter.state === "closed"}>
            {pending === "send" ? "发送中…" : "发送"}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-3 text-xs">当前角色只查看这间房间的消息。</p>
      )}
    </section>
  );
}

function Inspector({ onOpenCatalog }: { onOpenCatalog: () => void }) {
  const role = useMind((s) => s.role);
  const catalog = useMind((s) => s.catalog);
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const reading = useMind((s) => s.reading);
  const setReading = useMind((s) => s.setReading);
  const swap = useMind((s) => s.swap);
  const setCatalogTab = useMind((s) => s.setCatalogTab);
  const [swapKind, setSwapKind] = useState<string | null>(null);
  if (!matter) {
    return <aside className="text-muted-foreground bg-card border-l p-4 text-sm">新事项的权限在中间选定。创建之后，对话会出现在中间。</aside>;
  }
  const doc = findDoc(catalog, matter.kbDocId);
  const external = catalog.externals.find((item) => item.id === matter.externalId);
  const skill = catalog.skills.find((item) => item.id === matter.skillId);
  const approver = role !== "经办人";

  if (reading) {
    const title = reading === "kb" ? doc?.doc.title : reading === "external" ? external?.name : "工商查询";
    const body =
      reading === "kb"
        ? doc?.doc.body
        : reading === "external"
          ? `${external?.origin ?? ""}\n${external?.excerpt ?? ""}`
          : "右栏仍是演示，还没有这次任务的真实工具结果。";
    return (
      <aside className="bg-card flex min-h-0 flex-col border-l">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{title}</p>
          <button className="text-primary text-xs" onClick={() => setReading(null)}>
            关闭
          </button>
        </div>
        <p className="whitespace-pre-wrap p-3 text-sm leading-6">{body}</p>
      </aside>
    );
  }

  return (
    <aside className="bg-card min-h-0 overflow-auto border-l p-3 text-sm">
      <p className="text-muted-foreground text-xs">右栏仍是演示，不代表这间房间已经做过这些步骤。</p>
      {approver ? null : (
        <>
          <h2 className="mt-4 text-xs font-semibold">步骤</h2>
          <ol className="mt-2 space-y-2">
            {skill?.steps.map((step) => (
              <li key={step.id}>
                <p>{step.name}</p>
                <p className="text-muted-foreground text-xs">
                  {step.agentIds.map((id) => catalog.agents.find((agent) => agent.id === id)?.name).filter(Boolean).join("、") || "人工确认"}
                  {step.needsConfirm ? " · 需要确认" : ""}
                </p>
              </li>
            ))}
          </ol>
          <h2 className="mt-4 text-xs font-semibold">分工</h2>
          <ul className="mt-2 space-y-1">
            {catalog.agents.map((agent) => (
              <li key={agent.id}>
                {agent.name}
                <span className="text-muted-foreground"> · 演示</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-4 text-xs font-semibold">已引用</h2>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              <button className="text-primary" onClick={() => setReading("kb")}>
                {doc?.doc.title}
              </button>
            </li>
            <li>
              <button className="text-primary" onClick={() => setReading("external")}>
                {external?.name}
              </button>
            </li>
            <li>
              <button className="text-primary" onClick={() => setReading("mcp")}>
                工商查询结果
              </button>
            </li>
          </ul>
          <h2 className="mt-4 text-xs font-semibold">本次装备</h2>
          <EquipRow
            label={skill?.name ?? "Skill"}
            disabled={matter.state === "closed" || matter.permission === "read-only"}
            open={swapKind === "skill"}
            onToggle={() => setSwapKind(swapKind === "skill" ? null : "skill")}
            options={catalog.skills.map((item) => item.name)}
            onPick={(name) => {
              const next = catalog.skills.find((item) => item.name === name);
              if (next) swap({ skillId: next.id });
              setSwapKind(null);
            }}
          />
          <button
            className="text-primary mt-1 block text-xs"
            onClick={() => {
              setCatalogTab("skill", matter.skillId);
              onOpenCatalog();
            }}
          >
            打开这条 Skill
          </button>
        </>
      )}
    </aside>
  );
}

function EquipRow({
  label,
  disabled,
  open,
  onToggle,
  options,
  onPick,
}: {
  label: string;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  options: string[];
  onPick: (name: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <button className="text-primary text-xs" disabled={disabled} onClick={onToggle}>
          更换
        </button>
      </div>
      {open ? (
        <div className="mt-1 rounded-md border p-1">
          {options.map((option) => (
            <button key={option} className="block w-full px-2 py-1 text-left text-xs" onClick={() => onPick(option)}>
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
