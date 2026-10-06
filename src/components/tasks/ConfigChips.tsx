import { Cpu, Hammer, Link2, Sparkles, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TEAM_TOOLTIP, profileName } from "../../lib/display";
import { effectiveConnectors, effectiveSkills, expertOf, type ConfigCatalog } from "../../lib/configCatalog";
import { useSkillNames } from "../../lib/skillNames";
import { MODE_OPTIONS, type ConfigDraft } from "../../lib/taskConfig";
import { refId } from "../../lib/team";
import { Avatar, AvatarStack } from "../TeamAvatars";

interface ConfigChipsProps {
  readonly draft: ConfigDraft;
  readonly onChange: (next: ConfigDraft) => void;
  readonly catalog: ConfigCatalog;
}

/** 专家胶囊：头像圆点 + 名称。和 WorkBuddy 一样把专家当身份展示，而不是一串引用。 */
function ExpertAvatar({ name }: { name: string }) {
  return <Avatar name={name} />;
}

function ChipIcon({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return <Icon aria-hidden="true" className={className} />;
}

/** 输入框里已选的东西，每一项可以用 × 去掉。专家带来的默认技能和连接器也在里面，去掉就是明确清空。 */
export function ConfigChips({ draft, onChange, catalog }: ConfigChipsProps) {
  const expert = expertOf(draft, catalog.experts);
  const skills = effectiveSkills(draft, catalog.experts);
  const connectors = effectiveConnectors(draft, catalog.experts);
  // 菜单里勾选过的名称记在 labels 里；从任务配置或专家默认读回来的只有 id，这里查目录补名称。
  const skillNames = useSkillNames(skills);
  const chips: Array<{ key: string; label: string; icon: ReactNode; title?: string; remove: () => void }> = [];

  if (draft.mode !== "default") {
    chips.push({
      key: "mode",
      label: MODE_OPTIONS.find((option) => option.id === draft.mode)?.label ?? draft.mode,
      icon: <ChipIcon Icon={Sparkles} className="h-3.5 w-3.5 shrink-0 text-primary-700" />,
      remove: () => onChange({ ...draft, mode: "default" }),
    });
  }
  if (draft.team) {
    // 专家团：团队名和成员头像叠在一起；领队负责规划，成员按分工执行。
    const name = draft.teamName || catalog.experts.find((item) => item.expert_id === refId(draft.expert))?.name || "专家团";
    const members = draft.team.members.map((member) => ({ role: member.role, label: member.label, name: member.name || profileName(member.expert, catalog.experts) }));
    chips.push({ key: "team", label: name, title: TEAM_TOOLTIP, icon: <AvatarStack members={members} leader={draft.team.leader} />, remove: () => onChange({ ...draft, expert: "", team: null, teamName: "" }) });
  } else if (draft.expert) {
    const name = expert?.name ?? profileName(draft.expert, catalog.experts);
    chips.push({ key: "expert", label: name, icon: <ExpertAvatar name={name} />, remove: () => onChange({ ...draft, expert: "" }) });
  }
  if (draft.model) {
    // 任务级模型覆盖；× 回到默认（专家的模型，再退到部署默认）。
    chips.push({ key: "model", label: draft.model, icon: <ChipIcon Icon={Cpu} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, remove: () => onChange({ ...draft, model: "" }) });
  }
  for (const id of skills) {
    chips.push({
      key: `skill:${id}`,
      label: draft.labels[id] ?? skillNames[id] ?? id,
      icon: <ChipIcon Icon={Hammer} className="h-3.5 w-3.5 shrink-0 text-primary-700" />,
      remove: () => onChange({ ...draft, skills: skills.filter((item) => item !== id) }),
    });
  }
  for (const id of connectors) {
    const name = catalog.connectors.find((item) => item.id === id)?.name ?? id;
    chips.push({
      key: `connector:${id}`,
      label: name,
      icon: <ChipIcon Icon={Link2} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
      remove: () => onChange({ ...draft, connectorIds: connectors.filter((item) => item !== id) }),
    });
  }
  if (chips.length === 0) return null;

  return (
    <ul aria-label="已选择" className="flex max-w-[60%] flex-wrap items-center gap-1.5 py-2.5 pl-4">
      {chips.map((chip) => (
        <li key={chip.key} data-testid="config-chip" data-chip={chip.key} title={chip.title} className="flex h-7 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption text-foreground">
          {chip.icon}
          <span className="max-w-40 truncate">{chip.label}</span>
          <button type="button" aria-label={`移除 ${chip.label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-200" onClick={chip.remove}>
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
