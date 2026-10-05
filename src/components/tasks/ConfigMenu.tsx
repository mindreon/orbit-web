import { Bot, ChevronRight, Link2, Paperclip, Plus, Sparkles, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { TEAM_TOOLTIP, expertSummary, roleName } from "../../lib/display";
import { isTeam, singleExperts, type Expert } from "../../lib/experts";
import { effectiveConnectors, effectiveSkills, type ConfigCatalog } from "../../lib/configCatalog";
import { cn } from "../../lib/cn";
import { MODE_OPTIONS, type ConfigDraft, type ConfigMode } from "../../lib/taskConfig";
import { Option } from "./ConfigOption";
import { SkillPicker } from "./SkillPicker";

type Panel = "mode" | "expert" | "skills" | "connectors";

const ITEMS: ReadonlyArray<{ id: Panel; label: string; icon: ReactNode }> = [
  { id: "mode", label: "模式", icon: <Sparkles aria-hidden="true" className="h-4 w-4" /> },
  { id: "expert", label: "专家", icon: <Bot aria-hidden="true" className="h-4 w-4" /> },
  { id: "skills", label: "技能", icon: <Wrench aria-hidden="true" className="h-4 w-4" /> },
  { id: "connectors", label: "连接器", icon: <Link2 aria-hidden="true" className="h-4 w-4" /> },
];

interface ConfigMenuProps {
  readonly draft: ConfigDraft;
  readonly onChange: (next: ConfigDraft) => void;
  readonly catalog: ConfigCatalog;
  readonly disabled?: boolean;
  /** 提供后「添加文件」可用：打开调用方的文件选择框。 */
  readonly onAddFile?: () => void;
}

/** 输入框左下角的「+」：添加文件、模式、专家、技能、连接器。选中任意一项菜单就收起，加号转回原样。 */
export function ConfigMenu({ draft, onChange, catalog, disabled = false, onAddFile }: ConfigMenuProps) {
  // 选中即关闭：包一层，所有面板的修改都走这里。
  const choose = (next: ConfigDraft) => {
    onChange(next);
    setOpen(false);
  };
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("mode");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        data-testid="config-add"
        aria-label="添加专家、技能、连接器"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-50",
          open ? "bg-primary-100 text-primary-700" : "bg-secondary text-gray-600 hover:bg-gray-200 hover:text-foreground",
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-45")} />
      </button>
      {open ? (
        <div className="menu-in absolute bottom-full left-0 z-30 mb-2 flex items-end max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <div role="menu" aria-label="添加" className="w-44 rounded-card bg-card p-2 shadow-lg ring-1 ring-border">
            {onAddFile ? (
              <button
                type="button"
                role="menuitem"
                className="flex h-10 w-full items-center gap-2 rounded-control px-3 text-body text-foreground hover:bg-secondary"
                onClick={() => {
                  setOpen(false);
                  onAddFile();
                }}
              >
                <Paperclip aria-hidden="true" className="h-4 w-4" />
                添加文件
              </button>
            ) : (
              <button type="button" role="menuitem" disabled title="即将开放" className="flex h-10 w-full items-center gap-2 rounded-control px-3 text-body text-muted-foreground opacity-60">
                <Paperclip aria-hidden="true" className="h-4 w-4" />
                添加文件
              </button>
            )}
            {ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-expanded={panel === item.id}
                className={cn("flex h-10 w-full items-center gap-2 rounded-control px-3 text-body text-foreground hover:bg-secondary", panel === item.id && "bg-secondary")}
                onMouseEnter={() => setPanel(item.id)}
                onFocus={() => setPanel(item.id)}
                onClick={() => setPanel(item.id)}
              >
                {item.icon}
                {item.label}
                <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <div className="max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto sm:ml-1 rounded-card bg-card p-2 shadow-lg ring-1 ring-border" aria-label={ITEMS.find((item) => item.id === panel)?.label}>
            {catalog.error ? <p className="px-2 py-1 text-small text-danger-700">{catalog.error}</p> : null}
            {panel === "mode" ? <ModePanel draft={draft} onChange={choose} /> : null}
            {panel === "expert" ? <ExpertPanel draft={draft} onChange={choose} catalog={catalog} /> : null}
            {panel === "skills" ? <SkillsPanel draft={draft} onChange={choose} catalog={catalog} /> : null}
            {panel === "connectors" ? <ConnectorsPanel draft={draft} onChange={choose} catalog={catalog} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModePanel({ draft, onChange }: Pick<ConfigMenuProps, "draft" | "onChange">) {
  return (
    <>
      {MODE_OPTIONS.map((option) => (
        <Option key={option.id} kind="radio" checked={draft.mode === option.id} label={option.label} hint={option.description} onClick={() => onChange({ ...draft, mode: option.id as ConfigMode })} />
      ))}
    </>
  );
}

/** 选中一个专家团：任务会带着它的领队和成员（后端据专家团的引用展开）。 */
const withTeam = (draft: ConfigDraft, team: Expert): ConfigDraft => ({
  ...draft,
  expert: team.ref,
  team: { ref: team.ref, leader: team.leader ?? "", members: (team.members ?? []).map((member) => ({ ...member })) },
  teamName: team.name,
});

const teamHint = (team: Expert): string => `领队 ${team.members?.find((member) => member.role === team.leader)?.name ?? ""} · 成员 ${(team.members ?? []).map((member) => roleName(member.role, member.label, team.leader)).join("、")}`;

function ExpertPanel({ draft, onChange, catalog }: Pick<ConfigMenuProps, "draft" | "onChange" | "catalog">) {
  const singles = singleExperts(catalog.experts);
  const teams = catalog.experts.filter(isTeam);
  const single = (ref: string): ConfigDraft => ({ ...draft, expert: ref, team: null, teamName: "" });
  return (
    <>
      <Option kind="radio" checked={draft.expert === ""} label="默认智能体" hint="不指定专家" onClick={() => onChange(single(""))} />
      {singles.map((expert) => (
        <Option key={expert.ref} kind="radio" checked={draft.expert === expert.ref} label={expert.name} hint={expertSummary(expert.instructions) || "没有指令"} onClick={() => onChange(single(expert.ref))} />
      ))}
      {teams.length > 0 ? <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">专家团</p> : null}
      {teams.map((team) => (
        <Option key={team.ref} kind="radio" checked={draft.expert === team.ref} label={team.name} hint={teamHint(team)} title={TEAM_TOOLTIP} id={team.ref} onClick={() => onChange(withTeam(draft, team))} />
      ))}
      {!catalog.loading && catalog.experts.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">还没有自己的专家。</p> : null}
      <Link to="/experts/new" className="mt-1 block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary">
        创建专家
      </Link>
    </>
  );
}

function ConnectorsPanel({ draft, onChange, catalog }: Pick<ConfigMenuProps, "draft" | "onChange" | "catalog">) {
  const chosen = effectiveConnectors(draft, catalog.experts);
  const toggle = (id: string) => onChange({ ...draft, connectorIds: chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id] });
  return (
    <>
      {catalog.connectors.map((connector) => (
        <Option key={connector.id} kind="checkbox" checked={chosen.includes(connector.id)} label={connector.name} hint={connector.transport === "streamable_http" ? connector.url : connector.command} onClick={() => toggle(connector.id)} />
      ))}
      {!catalog.loading && catalog.connectors.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">还没有连接器。</p> : null}
      <Link to="/experts/connectors/new" className="mt-1 block rounded-control px-3 py-2 text-body text-primary-700 hover:bg-secondary">
        添加连接器
      </Link>
    </>
  );
}

function SkillsPanel({ draft, onChange, catalog }: Pick<ConfigMenuProps, "draft" | "onChange" | "catalog">) {
  const chosen = effectiveSkills(draft, catalog.experts);
  return (
    <SkillPicker
      chosen={chosen}
      onToggle={(skill) => {
        const next = chosen.includes(skill.id) ? chosen.filter((id) => id !== skill.id) : [...chosen, skill.id];
        onChange({ ...draft, skills: next, labels: { ...draft.labels, [skill.id]: skill.name } });
      }}
    />
  );
}
