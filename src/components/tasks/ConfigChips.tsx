import { Hammer, Link2, Sparkles, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TEAM_TOOLTIP, profileName } from "../../lib/display";
import { effectiveConnectors, effectiveSkills, expertOf, type ConfigCatalog } from "../../lib/configCatalog";
import { useSkillNames } from "../../lib/skillNames";
import { MODE_OPTIONS, type ConfigDraft } from "../../lib/taskConfig";
import { refId } from "../../lib/team";
import { Avatar, AvatarStack } from "../TeamAvatars";

interface ChipsProps {
  readonly draft: ConfigDraft;
  readonly onChange: (next: ConfigDraft) => void;
  readonly catalog: ConfigCatalog;
}

function ChipIcon({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return <Icon aria-hidden="true" className={className} />;
}

function Chip({ chipKey, label, icon, title, onRemove }: { chipKey: string; label: string; icon: ReactNode; title?: string; onRemove: () => void }) {
  return (
    <li key={chipKey} data-testid="config-chip" data-chip={chipKey} title={title} className="flex h-7 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption text-foreground">
      {icon}
      <span className="max-w-40 truncate">{label}</span>
      <button type="button" aria-label={`移除 ${label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-200" onClick={onRemove}>
        <X aria-hidden="true" className="h-3 w-3" />
      </button>
    </li>
  );
}

/** 输入行里的胶囊：技能。和 WorkBuddy 一样，技能跟着文字走进输入框；专家、连接器在下面的工具栏上。 */
export function InputChips({ draft, onChange, catalog }: ChipsProps) {
  const skills = effectiveSkills(draft, catalog.experts);
  // 菜单里勾选过的名称记在 labels 里；从任务配置或专家默认读回来的只有 id，这里查目录补名称。
  const skillNames = useSkillNames(skills);
  if (skills.length === 0) return null;
  return (
    <ul aria-label="已选技能" className="flex max-w-[60%] flex-wrap items-center gap-1.5 py-2.5 pl-4">
      {skills.map((id) => (
        <Chip
          key={`skill:${id}`}
          chipKey={`skill:${id}`}
          label={draft.labels[id] ?? skillNames[id] ?? id}
          icon={<ChipIcon Icon={Hammer} className="h-3.5 w-3.5 shrink-0 text-primary-700" />}
          onRemove={() => onChange({ ...draft, skills: skills.filter((item) => item !== id) })}
        />
      ))}
    </ul>
  );
}

/** 工具栏上的胶囊：专家/专家团、连接器和模式，摆在「+」旁边（WorkBuddy 的位置）；每一项都可以用 × 去掉。
 *  专家带来的默认技能和连接器也在里面，去掉就是明确清空。模型不走胶囊，由工具栏上的模型选择器显示。 */
export function ToolbarChips({ draft, onChange, catalog }: ChipsProps) {
  const expert = expertOf(draft, catalog.experts);
  const connectors = effectiveConnectors(draft, catalog.experts);
  const chips: ReactNode[] = [];

  if (draft.mode !== "default") {
    chips.push(
      <Chip
        key="mode"
        chipKey="mode"
        label={MODE_OPTIONS.find((option) => option.id === draft.mode)?.label ?? draft.mode}
        icon={<ChipIcon Icon={Sparkles} className="h-3.5 w-3.5 shrink-0 text-primary-700" />}
        onRemove={() => onChange({ ...draft, mode: "default" })}
      />,
    );
  }
  if (draft.team) {
    // 专家团：团队名和成员头像叠在一起；领队负责规划，成员按分工执行。
    const name = draft.teamName || catalog.experts.find((item) => item.expert_id === refId(draft.expert))?.name || "专家团";
    const members = draft.team.members.map((member) => ({ role: member.role, label: member.label, name: member.name || profileName(member.expert, catalog.experts) }));
    chips.push(
      <Chip
        key="team"
        chipKey="team"
        label={name}
        title={TEAM_TOOLTIP}
        icon={<AvatarStack members={members} leader={draft.team.leader} />}
        onRemove={() => onChange({ ...draft, expert: "", team: null, teamName: "" })}
      />,
    );
  } else if (draft.expert) {
    const name = expert?.name ?? profileName(draft.expert, catalog.experts);
    chips.push(
      <Chip
        key="expert"
        chipKey="expert"
        label={name}
        icon={<Avatar name={name} />}
        onRemove={() => onChange({ ...draft, expert: "" })}
      />,
    );
  }
  for (const id of connectors) {
    const name = catalog.connectors.find((item) => item.id === id)?.name ?? id;
    chips.push(
      <Chip
        key={`connector:${id}`}
        chipKey={`connector:${id}`}
        label={name}
        icon={<ChipIcon Icon={Link2} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        onRemove={() => onChange({ ...draft, connectorIds: connectors.filter((item) => item !== id) })}
      />,
    );
  }
  if (chips.length === 0) return null;
  return (
    <ul aria-label="已选择" className="flex flex-wrap items-center gap-1.5">
      {chips}
    </ul>
  );
}
