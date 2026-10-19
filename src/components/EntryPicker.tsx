import type { Asset, EntryKind } from "../api/types";
import { Field, Select } from "../ui/fields";
export function EntryPicker({ entries, value, onChange, disabled = false, kind }: { entries: readonly Asset[]; value: string; onChange(value: string): void; disabled?: boolean; kind?: EntryKind }) {
  return <Field label="入口"><Select name="entry_ref" className="w-full" required value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">选择专家或专家团</option>{(["agent", "team"] as const).map((group) => <optgroup key={group} label={group === "agent" ? "专家" : "专家团"}>{entries.filter((item) => item.kind === group && (!kind || group === kind)).map((item) => <option key={item.id} value={`${item.kind}:${item.publisher}/${item.name}`}>{group === "agent" ? "专家" : "专家团"} · {item.publisher}/{item.name}</option>)}</optgroup>)}</Select></Field>;
}
