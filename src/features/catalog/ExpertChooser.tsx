import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { Asset } from "../../api/types";
import { assetTitle } from "../../components/assetText";
import { Input } from "../../ui/fields";
import { Popover } from "../../ui/Popover";

const TRIGGER =
  "flex h-9 w-full items-center gap-2 rounded-control border border-input bg-card px-3 text-body outline-none hover:border-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

const PRESET_LIMIT = 20;

/** 目录导入的标识以 cat- 开头，和专家列表的「我的 / 目录」是同一种分法。 */
const isPreset = (asset: Asset) => asset.name.startsWith("cat-");

function matches(asset: Asset, needle: string) {
  if (!needle) return true;
  return `${assetTitle(asset)} ${asset.name} ${asset.description ?? ""}`.toLowerCase().includes(needle);
}

/**
 * 这位成员由哪位单人专家担任。下拉里先是「我的专家」，再是「系统预置」。
 * 预置可能有很多，所以按名字在已经载入的目录里筛，一次只列出前若干位。
 */
export function ExpertChooser({ id, value, experts, ariaLabel, onSelect }: { id?: string; value: string; experts: readonly Asset[]; ariaLabel: string; onSelect(id: string): void }) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const needle = keyword.trim().toLowerCase();
  const { mine, presets, presetTotal } = useMemo(() => {
    const matched = experts.filter((asset) => matches(asset, needle));
    const own = matched.filter((asset) => !isPreset(asset));
    const catalog = matched.filter(isPreset);
    return { mine: own, presets: catalog.slice(0, PRESET_LIMIT), presetTotal: catalog.length };
  }, [experts, needle]);
  const selected = experts.find((asset) => asset.id === value);

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-[var(--radix-popover-trigger-width)] p-2"
      trigger={
        <button id={id} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} className={`${TRIGGER} ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          <span className="min-w-0 flex-1 truncate text-left">{selected ? assetTitle(selected) : "请选择"}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
    >
      <Input aria-label="搜索专家" value={keyword} placeholder="搜索专家" autoFocus onChange={(event) => setKeyword(event.target.value)} />
      <div role="listbox" aria-label={ariaLabel} className="mt-1 max-h-72 overflow-auto">
        {mine.length > 0 ? <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">我的专家</p> : null}
        {mine.map((asset) => <Choice key={asset.id} asset={asset} checked={asset.id === value} onPick={pick} />)}
        {experts.some((asset) => !isPreset(asset)) && mine.length === 0 ? <p className="px-3 py-1 text-caption text-muted-foreground">自己的专家里没有叫这个的。</p> : null}
        {!experts.some((asset) => !isPreset(asset)) ? <p className="px-3 py-1 text-caption text-muted-foreground">还没有自己的单人专家，可以在下面选系统预置。</p> : null}
        <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">系统预置</p>
        {presets.map((asset) => <Choice key={asset.id} asset={asset} checked={asset.id === value} onPick={pick} />)}
        {presetTotal === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">没有匹配的预置专家。</p> : null}
        {presetTotal > presets.length ? <p className="px-3 py-2 text-caption text-muted-foreground">还有 {presetTotal - presets.length} 位，输入名字缩小范围。</p> : null}
      </div>
    </Popover>
  );
}

function Choice({ asset, checked, onPick }: { asset: Asset; checked: boolean; onPick(id: string): void }) {
  return (
    <button type="button" role="option" aria-selected={checked} className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-body hover:bg-secondary" onClick={() => onPick(asset.id)}>
      <span className="min-w-0 flex-1 truncate">{assetTitle(asset)}</span>
      {checked ? <span className="shrink-0 text-caption text-primary-700">已选</span> : null}
    </button>
  );
}
