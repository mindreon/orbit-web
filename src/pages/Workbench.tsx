import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  confirmOf,
  currentStepName,
  feedOf,
  FILTERS,
  findDoc,
  JUMPS,
  matterTitle,
  needsRole,
  permissionLabel,
  type FilterId,
  type PermissionPreset,
} from "../model";
import { useMind } from "../store";
import { Area, Button } from "../ui";
import { cn } from "../lib/cn";

export function WorkbenchPage() {
  const activeId = useMind((s) => s.activeId);
  const opening = useMind((s) => s.matters.find((matter) => matter.id === activeId)?.openingPhase);
  const advanceOpening = useMind((s) => s.advanceOpening);
  useEffect(() => {
    if (opening === null || opening === undefined) return;
    const timer = window.setTimeout(advanceOpening, 700);
    return () => window.clearTimeout(timer);
  }, [opening, advanceOpening, activeId]);
  const navigate = useNavigate();
  const role = useMind((s) => s.role);
  const filter = useMind((s) => s.filter);
  const setFilter = useMind((s) => s.setFilter);
  const matters = useMind((s) => s.matters);
  const catalog = useMind((s) => s.catalog);
  const selectMatter = useMind((s) => s.selectMatter);
  const startBlank = useMind((s) => s.startBlank);
  const jump = useMind((s) => s.jump);

  const visible = matters.filter((matter) => {
    if (filter === "已完成") return matter.status === "已完成";
    if (filter === "待我确认") return needsRole(matter, role);
    return matter.status !== "已完成";
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-accent/60 text-muted-foreground flex items-center gap-2 border-b px-4 py-1.5 text-xs">
        <span>原型跳转</span>
        {JUMPS.map((item) => (
          <button key={item.id} className="hover:text-foreground underline" onClick={() => jump(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
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
                  {needsRole(matter, role) ? (
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[11px]">待我确认</span>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {matter.supplier} · {permissionLabel(matter.permission)} · {matter.status} · {currentStepName(matter, catalog)}
                </p>
              </button>
            ))}
            {visible.length === 0 ? (
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
          if (!draft.trim()) return;
          createMatter(draft, permission);
        }}
      >
        <Area rows={3} value={draft} placeholder="给华北钢材办供应商准入" onChange={(event) => setDraft(event.target.value)} />
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
        <Button className="mt-3" type="submit">
          创建
        </Button>
      </form>
    </section>
  );
}

function Timeline() {
  const role = useMind((s) => s.role);
  const catalog = useMind((s) => s.catalog);
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const threadAgentId = useMind((s) => s.threadAgentId);
  const setThread = useMind((s) => s.setThread);
  const send = useMind((s) => s.send);
  const skipOpening = useMind((s) => s.skipOpening);
  const setReading = useMind((s) => s.setReading);
  const [text, setText] = useState("");
  const feed = useMemo(() => (matter ? feedOf(matter, catalog) : []), [matter, catalog]);
  const shown = threadAgentId ? feed.filter((item) => item.agentId === threadAgentId) : feed;
  const threadName = catalog.agents.find((agent) => agent.id === threadAgentId)?.name;
  if (!matter) return <BlankMatter />;
  const card = confirmOf(matter, catalog);

  return (
    <section className="bg-background flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="text-base font-semibold">{matterTitle(matter)}</h1>
        <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs" title="权限在创建这件事时已经确定">
          {permissionLabel(matter.permission)}
        </span>
        {matter.permission === "danger-full-access" ? (
          <p className="text-muted-foreground text-xs">完全访问只作用于这件事，已关闭默认审批。</p>
        ) : null}
        {threadAgentId ? (
          <button className="text-primary text-xs" onClick={() => setThread(null)}>
            返回主时间线
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {threadAgentId ? <p className="text-muted-foreground text-xs">与{threadName}的对话</p> : null}
        {shown.length === 0 && !card ? (
          <p className="text-muted-foreground py-8 text-center text-sm">发送后，进展和审批会出现在这里。</p>
        ) : null}
        {shown.map((item) => (
          <article key={item.id} className="max-w-2xl">
            <p className="text-muted-foreground text-xs">{item.who}</p>
            <p className="mt-1 text-sm leading-6">{item.text}</p>
            {item.cite ? (
              <button className="text-primary mt-1 text-xs" onClick={() => setReading(item.cite ?? null)}>
                查看来源
              </button>
            ) : null}
          </article>
        ))}
        {card && !threadAgentId ? <ConfirmCard /> : null}
        {matter.openingPhase !== null ? (
          <Button variant="outline" onClick={skipOpening}>
            跳过，停在办理中
          </Button>
        ) : null}
      </div>
      {role === "经办人" ? (
        <form
          className="border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(text);
            setText("");
          }}
        >
          <Area
            rows={2}
            value={text}
            placeholder={threadName ? `对${threadName}说，这句话会回到主时间线` : "对经办助手说，输入 @制度核查 可以插话"}
            onChange={(event) => setText(event.target.value)}
          />
          <Button className="mt-2" type="submit">
            发送
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-3 text-xs">时间线只读。请在右侧处理你的确认。</p>
      )}
    </section>
  );
}

function ConfirmCard() {
  const role = useMind((s) => s.role);
  const catalog = useMind((s) => s.catalog);
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const decide = useMind((s) => s.decide);
  const setReading = useMind((s) => s.setReading);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("缺少安全生产许可证");
  if (!matter) return null;
  const card = confirmOf(matter, catalog);
  if (!card) return null;
  const allowed = card.actor === role && matter.permission !== "read-only";

  return (
    <div className="bg-card max-w-xl rounded-lg border p-3">
      <p className="text-xs font-semibold">当前事项的审批 · {card.action}</p>
      <p className="mt-2 text-sm leading-6">{card.conclusion}</p>
      <div className="mt-2 flex gap-2">
        {card.cites.map((cite) => (
          <button key={cite} className="text-primary text-xs" onClick={() => setReading(cite)}>
            {cite === "kb" ? "制度原文" : cite === "external" ? "外部来源" : "工商结果"}
          </button>
        ))}
      </div>
      {matter.permission === "read-only" ? (
        <p className="text-muted-foreground mt-2 text-xs">只读只作用于这件事：可以查看，不会改文件。</p>
      ) : null}
      {!allowed && matter.permission !== "read-only" ? (
        <p className="text-muted-foreground mt-2 text-xs">等待{card.actor}处理</p>
      ) : null}
      {rejecting ? (
        <div className="mt-2">
          <Area rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            className="mt-2"
            variant="danger"
            disabled={!allowed || reason.trim().length === 0}
            onClick={() => {
              decide(false, reason);
              setRejecting(false);
            }}
          >
            确认驳回
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button disabled={!allowed} onClick={() => decide(true, "")}>
            允许这一次
          </Button>
          <Button variant="outline" disabled={!allowed} onClick={() => setRejecting(true)}>
            拒绝并停止
          </Button>
        </div>
      )}
    </div>
  );
}

function Inspector({ onOpenCatalog }: { onOpenCatalog: () => void }) {
  const role = useMind((s) => s.role);
  const catalog = useMind((s) => s.catalog);
  const matter = useMind((s) => s.matters.find((item) => item.id === s.activeId));
  const reading = useMind((s) => s.reading);
  const setReading = useMind((s) => s.setReading);
  const setThread = useMind((s) => s.setThread);
  const swap = useMind((s) => s.swap);
  const setCatalogTab = useMind((s) => s.setCatalogTab);
  const [swapKind, setSwapKind] = useState<string | null>(null);
  if (!matter) {
    return <aside className="text-muted-foreground bg-card border-l p-4 text-sm">新事项的权限在中间选定。创建之后，审批会出现在对话后面。</aside>;
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
          : `${matter.supplier}有限公司，统一社会信用代码 91130100MOCK88421，登记状态存续。`;
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
      <ConfirmCard />
      {approver ? null : (
        <>
          <h2 className="mt-4 text-xs font-semibold">步骤</h2>
          <ol className="mt-2 space-y-2">
            {skill?.steps.map((step) => (
              <li key={step.id}>
                <p className={cn(step.name === currentStepName(matter, catalog) && "text-primary")}>{step.name}</p>
                <p className="text-muted-foreground text-xs">
                  {step.agentIds.map((id) => catalog.agents.find((agent) => agent.id === id)?.name).filter(Boolean).join("、") || "人工确认"}
                  {step.needsConfirm ? " · 需要确认" : ""}
                </p>
              </li>
            ))}
            {matter.viaReject ? <li>补交材料 · 经办助手起草，经办人确认</li> : null}
          </ol>
          <h2 className="mt-4 text-xs font-semibold">分工</h2>
          <ul className="mt-2 space-y-1">
            {catalog.agents.map((agent) => (
              <li key={agent.id}>
                <button className="text-left" onClick={() => setThread(agent.id)}>
                  {agent.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {matter.openingPhase !== null ? "正在做" : "已交回"}
                  </span>
                </button>
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
            disabled={matter.status === "已完成" || matter.permission === "read-only"}
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
