import { X } from "lucide-react";
import { effectiveConnectors, effectiveSkills, expertOf, type ConfigCatalog } from "../../lib/configCatalog";
import { MODE_OPTIONS, type ConfigDraft } from "../../lib/taskConfig";

interface ConfigChipsProps {
  readonly draft: ConfigDraft;
  readonly onChange: (next: ConfigDraft) => void;
  readonly catalog: ConfigCatalog;
}

/** 输入框里已选的东西，每一项可以用 × 去掉。专家带来的默认技能和连接器也在里面，去掉就是明确清空。 */
export function ConfigChips({ draft, onChange, catalog }: ConfigChipsProps) {
  const expert = expertOf(draft, catalog.experts);
  const skills = effectiveSkills(draft, catalog.experts);
  const connectors = effectiveConnectors(draft, catalog.experts);
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];

  if (draft.mode !== "default") {
    chips.push({ key: "mode", label: MODE_OPTIONS.find((option) => option.id === draft.mode)?.label ?? draft.mode, remove: () => onChange({ ...draft, mode: "default" }) });
  }
  if (draft.expert) {
    chips.push({ key: "expert", label: expert?.name ?? draft.expert, remove: () => onChange({ ...draft, expert: "" }) });
  }
  for (const id of skills) {
    chips.push({ key: `skill:${id}`, label: draft.labels[id] ?? id, remove: () => onChange({ ...draft, skills: skills.filter((item) => item !== id) }) });
  }
  for (const id of connectors) {
    const name = catalog.connectors.find((item) => item.id === id)?.name ?? id;
    chips.push({ key: `connector:${id}`, label: name, remove: () => onChange({ ...draft, connectorIds: connectors.filter((item) => item !== id) }) });
  }
  if (chips.length === 0) return null;

  return (
    <ul aria-label="已选择" className="flex flex-wrap gap-1.5 px-3 pt-2">
      {chips.map((chip) => (
        <li key={chip.key} data-testid="config-chip" className="flex h-7 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-xs text-foreground">
          <span className="max-w-40 truncate">{chip.label}</span>
          <button type="button" aria-label={`移除 ${chip.label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-border" onClick={chip.remove}>
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
