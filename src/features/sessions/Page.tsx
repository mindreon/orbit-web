import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bot, Check, ChevronDown, ChevronRight, Cpu, Hammer, Hand, Link2, Paperclip, Plus, ShieldAlert, ShieldCheck, ShieldPlus, SlidersHorizontal, Sparkles, Users, Wrench, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, describeFailure } from "../../api/errors";
import type { Asset, EntryKind } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { COARSE_POINTER, useMediaQuery } from "../../platform/useMediaQuery";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { cn } from "../../lib/cn";
import { NewSessionDialog } from "./NewSessionDialog";
import { createSession, useEntries } from "./api";

const EXAMPLES = ["梳理本周发布风险", "给这个 PR 写一份审查清单", "总结当前待审批的事项"];
const TITLE_MAX = 30;

const MODES = [
  { id: "default", label: "默认", hint: "按目标规划并执行，需要时向你确认" },
  { id: "plan", label: "计划", hint: "先规划再执行（目前与默认一致，任务本来就先规划）" },
  { id: "ask", label: "仅问答", hint: "只读：只回答问题，不修改任何文件" },
] as const;

type ModeId = (typeof MODES)[number]["id"];
type PermissionId = "default" | "request" | "auto" | "full" | "custom";
type PanelId = "mode" | "expert" | "skills" | "connectors";

const PERMISSIONS: ReadonlyArray<{ id: PermissionId; label: string; short: string; hint: string; Icon: LucideIcon; danger?: boolean }> = [
  { id: "default", label: "默认权限", short: "默认权限", hint: "工作区内编辑文件自动通过，运行命令前需要你确认。", Icon: ShieldCheck },
  { id: "request", label: "请求批准", short: "请求批准", hint: "编辑文件和运行命令前都需要你确认。", Icon: Hand },
  { id: "auto", label: "帮我批准", short: "帮我批准", hint: "编辑和普通命令自动通过，只有检测到风险的操作才问你。", Icon: ShieldPlus },
  { id: "full", label: "完全访问权限", short: "完全访问", hint: "沙箱内的操作全部自动通过；灾难性命令仍会被拒绝。", Icon: ShieldAlert, danger: true },
  { id: "custom", label: "自定义权限", short: "自定义", hint: "使用设置里的读写范围和自动审批规则。", Icon: SlidersHorizontal },
];

const PANELS: ReadonlyArray<{ id: PanelId; label: string; Icon: LucideIcon }> = [
  { id: "mode", label: "模式", Icon: Sparkles },
  { id: "expert", label: "专家", Icon: Bot },
  { id: "skills", label: "技能", Icon: Wrench },
  { id: "connectors", label: "连接器", Icon: Link2 },
];

interface Pick {
  id: string;
  name: string;
}

function deriveTitle(goal: string) {
  const first = goal.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX)}…` : first;
}

function mine(items: readonly Asset[]) {
  return items.filter((item) => !item.name.startsWith("cat-"));
}

interface CatalogExpert {
  id: string;
  handle: string;
  slug: string;
  name: string;
}

interface ExpertChoice {
  id: string;
  kind: EntryKind;
  ref: string;
  label: string;
}

function choiceOf(item: Asset): ExpertChoice {
  return { id: item.id, kind: item.kind === "team" ? "team" : "agent", ref: `${item.publisher}/${item.name}`, label: item.display_name || item.name };
}

export default function SessionsHome() {
  const client = useQueryClient();
  const { currentTenant } = useIdentity();
  const tenant = currentTenant?.id ?? null;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const entries = useEntries();
  const touch = useMediaQuery(COARSE_POINTER);
  const preset = params.get("new") ?? "";
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState<ExpertChoice | null>(null);
  const [mode, setMode] = useState<ModeId>("default");
  const [permission, setPermission] = useState<PermissionId>("default");
  const [skills, setSkills] = useState<Pick[]>([]);
  const [connectors, setConnectors] = useState<Pick[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [panel, setPanel] = useState<PanelId>("mode");
  const [permOpen, setPermOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [skillQ, setSkillQ] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [expertQ, setExpertQ] = useState("");
  const [expertQuery, setExpertQuery] = useState("");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [mcpQ, setMcpQ] = useState("");
  const [mcpQuery, setMcpQuery] = useState("");
  const pickToken = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const box = useRef<HTMLDivElement>(null);
  const body = picked && workspace.current ? { workspace_id: workspace.current.id, entry_kind: picked.kind, entry_ref: picked.ref, title: deriveTitle(goal), message_policy: "queue" as const } : null;
  const intent = useIdempotencyIntent(body);

  useEffect(() => {
    const timer = setTimeout(() => setSkillQuery(skillQ.trim()), 250);
    return () => clearTimeout(timer);
  }, [skillQ]);
  useEffect(() => {
    const timer = setTimeout(() => setMcpQuery(mcpQ.trim()), 250);
    return () => clearTimeout(timer);
  }, [mcpQ]);
  useEffect(() => {
    const timer = setTimeout(() => setExpertQuery(expertQ.trim()), 250);
    return () => clearTimeout(timer);
  }, [expertQ]);
  useEffect(() => {
    if (!addOpen && !permOpen && !modelOpen) return;
    function close(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) {
        setAddOpen(false);
        setPermOpen(false);
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [addOpen, permOpen, modelOpen]);

  const skillHits = useQuery({
    queryKey: qk.market(tenant, "skills", { q: skillQuery, picker: true }),
    enabled: addOpen && panel === "skills",
    queryFn: ({ signal }) => api.get<{ items: { id: string; name: string }[] }>("/market/skills", { signal, query: { q: skillQuery, limit: 8 } }),
  });
  const mcpHits = useQuery({
    queryKey: qk.market(tenant, "mcp", { q: mcpQuery, picker: true }),
    enabled: addOpen && panel === "connectors",
    queryFn: ({ signal }) => api.get<{ items: { id: string; name: string }[] }>("/market/mcp", { signal, query: { q: mcpQuery, limit: 8 } }),
  });
  const expertHits = useQuery({
    queryKey: qk.market(tenant, "agents", { q: expertQuery, picker: true }),
    enabled: addOpen && panel === "expert",
    queryFn: ({ signal }) => api.get<{ items: CatalogExpert[] }>("/market/agents/runnable", { signal, query: { q: expertQuery, sort: "downloads", limit: 24 } }),
  });

  async function pickCatalog(item: CatalogExpert) {
    const token = ++pickToken.current;
    setCatalogId(item.id);
    setAddOpen(false);
    setError(undefined);
    try {
      const entry = await api.get<{ entry_ref: string; name: string }>(`/market/agents/${encodeURIComponent(item.handle)}/${encodeURIComponent(item.slug)}/entry`);
      if (token !== pickToken.current) return;
      setPicked({ id: item.id, kind: "agent", ref: entry.entry_ref, label: entry.name || item.name });
    } catch (failure) {
      if (token !== pickToken.current) return;
      setCatalogId(null);
      setPicked(null);
      setError(failure instanceof ApiError && failure.status === 404 ? new Error("这位专家还不能直接开聊") : failure);
    }
  }

  function closeDialog() {
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }

  const owned = mine(entries.data ?? []);
  const agents = owned.filter((item) => item.kind === "agent");
  const teams = owned.filter((item) => item.kind === "team");
  const empty = goal.trim() === "" || !picked || !workspace.current;
  const permissionText = PERMISSIONS.find((item) => item.id === permission) ?? PERMISSIONS[0];

  function toggleSkill(item: Pick) {
    setSkills((current) => (current.some((skill) => skill.id === item.id) ? current.filter((skill) => skill.id !== item.id) : [...current, item]));
    setAddOpen(false);
  }

  function toggleConnector(item: Pick) {
    setConnectors((current) => (current.some((connector) => connector.id === item.id) ? current.filter((connector) => connector.id !== item.id) : [...current, item]));
    setAddOpen(false);
  }

  async function submit() {
    if (empty || busy || !body) return;
    setBusy(true);
    setError(undefined);
    try {
      const session = await createSession(body, intent.key);
      await api.post(`/sessions/${session.id}/messages`, { text: goal.trim() }, { idempotencyKey: crypto.randomUUID() });
      intent.succeeded();
      await client.invalidateQueries({ queryKey: qk.sessionLists(tenant) });
      navigate(`/sessions/${session.id}`);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-card px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-center text-heading font-semibold text-foreground sm:text-display">Orbit，我帮你</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="h-8 rounded-full bg-secondary px-3 text-body text-gray-700 hover:bg-gray-200" onClick={() => setGoal(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="mt-5 w-full max-w-3xl">
        <div ref={box} className="relative rounded-card bg-card shadow-md ring-1 ring-border focus-within:ring-primary-500">
          <div className="flex items-start">
            {skills.length > 0 ? (
              <ul aria-label="已选技能" className="flex max-w-[60%] flex-wrap items-center gap-1.5 py-2.5 pl-4">
                {skills.map((skill) => (
                  <Chip key={skill.id} label={skill.name} icon={<Hammer aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-700" />} onRemove={() => setSkills((current) => current.filter((item) => item.id !== skill.id))} />
                ))}
              </ul>
            ) : null}
            <textarea
              value={goal}
              autoFocus
              rows={3}
              aria-label="任务目标"
              placeholder={touch ? "今天帮你做些什么？写下目标，点右下角的箭头开始" : "今天帮你做些什么？写下目标，Enter 开始，Shift+Enter 换行"}
              className="block max-h-64 min-h-[5.5rem] min-w-0 flex-1 resize-none bg-transparent px-4 pt-4 text-title text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <div className="relative">
              <button
                type="button"
                aria-label="添加专家、技能、连接器"
                aria-haspopup="menu"
                aria-expanded={addOpen}
                className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", addOpen ? "bg-primary-100 text-primary-700" : "bg-secondary text-gray-600 hover:bg-gray-200 hover:text-foreground")}
                onClick={() => {
                  setPermOpen(false);
                  setModelOpen(false);
                  setAddOpen((value) => !value);
                  setPanel("mode");
                }}
              >
                <Plus aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-200", addOpen && "rotate-45")} />
              </button>
              {addOpen ? (
                <div className="absolute bottom-full left-0 z-30 mb-2 flex items-end max-sm:flex-col max-sm:items-start max-sm:gap-1">
                  <div role="menu" aria-label="添加" className="w-44 rounded-card bg-card p-2 shadow-lg ring-1 ring-border">
                    <button type="button" role="menuitem" disabled title="即将开放" className="flex h-10 w-full items-center gap-2 rounded-control px-3 text-body text-muted-foreground opacity-60">
                      <Paperclip aria-hidden="true" className="h-4 w-4" />
                      添加文件
                    </button>
                    {PANELS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        aria-expanded={panel === item.id}
                        className={cn("flex h-10 w-full items-center gap-2 rounded-control px-3 text-body text-foreground hover:bg-secondary", panel === item.id && "bg-secondary")}
                        onMouseEnter={touch ? undefined : () => setPanel(item.id)}
                        onFocus={() => setPanel(item.id)}
                        onClick={() => setPanel(item.id)}
                      >
                        <item.Icon aria-hidden="true" className="h-4 w-4" />
                        {item.label}
                        <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                  <div className="max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card bg-card p-2 shadow-lg ring-1 ring-border sm:ml-1" aria-label={PANELS.find((item) => item.id === panel)?.label}>
                    {panel === "mode" ? MODES.map((item) => (
                      <Option key={item.id} checked={mode === item.id} label={item.label} hint={item.hint} onClick={() => { setMode(item.id); setAddOpen(false); }} />
                    )) : null}
                    {panel === "expert" ? (
                      <>
                        <input aria-label="搜索专家" value={expertQ} placeholder="搜索专家" className="mb-1 h-8 w-full rounded-control border border-input bg-card px-2.5 text-body outline-none placeholder:text-muted-foreground focus:border-primary-500" onChange={(event) => setExpertQ(event.target.value)} />
                        {agents.map((item) => (
                          <Option key={item.id} checked={picked?.id === item.id} label={item.display_name || item.name} onClick={() => { setPicked(choiceOf(item)); setCatalogId(null); setAddOpen(false); }} />
                        ))}
                        {teams.length > 0 ? <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">专家团</p> : null}
                        {teams.map((item) => (
                          <Option key={item.id} checked={picked?.id === item.id} label={item.display_name || item.name} onClick={() => { setPicked(choiceOf(item)); setCatalogId(null); setAddOpen(false); }} />
                        ))}
                        {owned.length > 0 && (expertHits.data?.items.length ?? 0) > 0 ? <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">目录</p> : null}
                        {(expertHits.data?.items ?? []).map((item) => (
                          <Option key={item.id} checked={catalogId === item.id} label={item.name} onClick={() => void pickCatalog(item)} />
                        ))}
                        {expertHits.error ? <p className="px-3 py-2 text-caption text-danger-700">{describeFailure("读取专家失败", expertHits.error)}</p> : null}
                        {entries.isPending || expertHits.isPending ? <p className="px-3 py-2 text-caption text-muted-foreground">正在读取…</p> : null}
                        {!entries.isPending && !expertHits.isPending && owned.length === 0 && (expertHits.data?.items.length ?? 0) === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">没有匹配的专家。</p> : null}
                        <Link to="/experts" className="mt-1 block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary" onClick={() => setAddOpen(false)}>浏览专家</Link>
                        <Link to="/experts/new" className="block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary" onClick={() => setAddOpen(false)}>创建专家</Link>
                      </>
                    ) : null}
                    {panel === "skills" ? (
                      <>
                        <input aria-label="搜索技能" value={skillQ} placeholder="搜索技能" className="mb-1 h-8 w-full rounded-control border border-input bg-card px-2.5 text-body outline-none placeholder:text-muted-foreground focus:border-primary-500" onChange={(event) => setSkillQ(event.target.value)} />
                        {skillHits.error ? <p className="px-2 py-1 text-small text-danger-700">{describeFailure("读取技能失败", skillHits.error)}</p> : null}
                        {(skillHits.data?.items ?? []).map((item) => (
                          <Option key={item.id} kind="checkbox" checked={skills.some((skill) => skill.id === item.id)} label={item.name} onClick={() => toggleSkill(item)} />
                        ))}
                        <Link to="/skills" className="mt-1 block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary" onClick={() => setAddOpen(false)}>浏览技能</Link>
                      </>
                    ) : null}
                    {panel === "connectors" ? (
                      <>
                        <input aria-label="搜索连接器" value={mcpQ} placeholder="搜索连接器" className="mb-1 h-8 w-full rounded-control border border-input bg-card px-2.5 text-body outline-none placeholder:text-muted-foreground focus:border-primary-500" onChange={(event) => setMcpQ(event.target.value)} />
                        {mcpHits.error ? <p className="px-2 py-1 text-small text-danger-700">{describeFailure("读取连接器失败", mcpHits.error)}</p> : null}
                        {(mcpHits.data?.items ?? []).map((item) => (
                          <Option key={item.id} kind="checkbox" checked={connectors.some((connector) => connector.id === item.id)} label={item.name} onClick={() => toggleConnector(item)} />
                        ))}
                        <Link to="/mcp" className="mt-1 block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary" onClick={() => setAddOpen(false)}>浏览连接器</Link>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {mode !== "default" || picked || connectors.length > 0 ? (
              <ul aria-label="已选择" className="flex min-w-0 items-center gap-1.5">
                {mode !== "default" ? <Chip label={MODES.find((item) => item.id === mode)?.label ?? mode} icon={<Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-700" />} onRemove={() => setMode("default")} /> : null}
                {picked ? <Chip label={picked.label} icon={picked.kind === "team" ? <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-700" /> : <Bot aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-700" />} onRemove={() => { setPicked(null); setCatalogId(null); }} /> : null}
                {connectors.map((connector) => (
                  <Chip key={connector.id} label={connector.name} icon={<Link2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />} onRemove={() => setConnectors((current) => current.filter((item) => item.id !== connector.id))} />
                ))}
              </ul>
            ) : null}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={`权限：${permissionText.label}`}
                aria-haspopup="menu"
                aria-expanded={permOpen}
                title={`权限：${permissionText.label}`}
                className={cn("flex h-8 items-center gap-1.5 rounded-control px-2 text-body hover:bg-gray-100", permissionText.danger ? "text-danger-700" : "text-gray-600 hover:text-foreground")}
                onClick={() => {
                  setAddOpen(false);
                  setModelOpen(false);
                  setPermOpen((value) => !value);
                }}
              >
                <permissionText.Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {permissionText.short}
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              {permOpen ? (
                <div role="menu" aria-label="应如何批准 Agent 操作？" className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-card bg-card p-1 shadow-lg ring-1 ring-border">
                  <p className="px-3 pb-1 pt-2 text-small font-medium text-muted-foreground">应如何批准 Agent 操作？</p>
                  {PERMISSIONS.map((item) => (
                    <button key={item.id} type="button" role="menuitemradio" aria-checked={permission === item.id} className="flex w-full items-start gap-3 rounded-control px-3 py-2 text-left hover:bg-secondary" onClick={() => { setPermission(item.id); setPermOpen(false); }}>
                      <item.Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", item.danger ? "text-danger-700" : "text-gray-600")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-body font-medium", item.danger ? "text-danger-700" : "text-foreground")}>{item.label}</span>
                        <span className="mt-0.5 block text-small text-muted-foreground">{item.hint}</span>
                      </span>
                      {permission === item.id ? <Check aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", item.danger ? "text-danger-700" : "text-primary-700")} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="ml-auto" />
            <button type="button" aria-label="提示词优化" title="提示词优化（即将开放）" disabled className="flex h-8 w-8 items-center justify-center rounded-control text-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={modelOpen}
                title="模型：默认模型"
                className="flex h-8 items-center gap-1.5 rounded-control px-2 text-body text-gray-600 hover:bg-gray-100 hover:text-foreground"
                onClick={() => {
                  setAddOpen(false);
                  setPermOpen(false);
                  setModelOpen((value) => !value);
                }}
              >
                <Cpu aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="max-w-40 truncate">默认模型</span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              </button>
              {modelOpen ? (
                <div role="listbox" aria-label="模型" className="absolute bottom-full right-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-card bg-card p-2 shadow-lg ring-1 ring-border">
                  <Option checked label="默认模型" onClick={() => setModelOpen(false)} />
                </div>
              ) : null}
            </div>
            <button type="button" aria-label="开始任务" disabled={empty || busy} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-secondary disabled:text-gray-500" onClick={() => void submit()}>
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error ? <Alert className="mt-3">{describeFailure("创建对话失败", error)}</Alert> : null}
        {entries.error ? <Alert className="mt-3">{describeFailure("读取专家失败", entries.error)}</Alert> : null}
        <p className="mt-3 text-center text-small text-muted-foreground">内容由 AI 生成，请核实重要信息</p>
      </div>
      {preset && workspace.current ? <NewSessionDialog onClose={closeDialog} onCreated={(session) => { void client.invalidateQueries({ queryKey: qk.sessionLists(tenant) }); closeDialog(); navigate(`/sessions/${session.id}`); }} /> : null}
    </div>
  );
}

function Chip({ label, icon, onRemove }: { label: string; icon: ReactNode; onRemove(): void }) {
  return (
    <li className="flex h-7 min-w-0 shrink items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption text-foreground">
      {icon}
      <span className="min-w-0 max-w-40 truncate">{label}</span>
      <button type="button" aria-label={`移除 ${label}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-200" onClick={onRemove}>
        <X aria-hidden="true" className="h-3 w-3" />
      </button>
    </li>
  );
}

function Option({ checked, kind = "radio", label, hint, onClick }: { checked: boolean; kind?: "radio" | "checkbox"; label: string; hint?: string; onClick(): void }) {
  return (
    <button type="button" role={kind === "radio" ? "menuitemradio" : "menuitemcheckbox"} aria-checked={checked} className="flex w-full items-start gap-2 rounded-control px-3 py-2 text-left text-body text-foreground hover:bg-secondary" onClick={onClick}>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint ? <span className="mt-0.5 block text-caption text-muted-foreground">{hint}</span> : null}
      </span>
      {checked ? <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" /> : null}
    </button>
  );
}
