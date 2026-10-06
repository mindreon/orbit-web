import { ChevronDown, Cpu } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { usePopoverClose } from "../../lib/usePopoverClose";
import type { ConfigDraft } from "../../lib/taskConfig";
import type { ConfigCatalog } from "../../lib/configCatalog";
import { ChooserPanel } from "../../ui/ChooserPanel";
import { Option } from "../../ui/Option";

/**
 * 输入框下方的模型选择，像 WorkBuddy 的「⚡ 快速」那个位置。候选是自己的专家用过的模型；不选（默认模型）就按
 * 专家配置的模型跑，专家没有的用部署默认（`ORBIT_MODEL_NAME`）。
 */
export function ModelSelector({ draft, onChange, catalog }: { draft: ConfigDraft; onChange: (next: ConfigDraft) => void; catalog: ConfigCatalog }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  usePopoverClose(open, box, () => setOpen(false));

  const models = useMemo(() => [...new Set(catalog.experts.map((expert) => expert.model).filter(Boolean))].sort(), [catalog.experts]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        data-testid="model-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-control px-2 text-body text-gray-600 hover:bg-gray-100 hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <Cpu aria-hidden="true" className="h-4 w-4" />
        {draft.model || "默认模型"}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <ChooserPanel label="模型" className="bottom-full left-0 mb-2 w-64">
          <Option
            kind="radio"
            checked={draft.model === ""}
            label="默认模型"
            id=""
            onClick={() => {
              onChange({ ...draft, model: "" });
              setOpen(false);
            }}
          />
          {models.map((model) => (
            <Option
              key={model}
              kind="radio"
              checked={draft.model === model}
              label={model}
              id={model}
              onClick={() => {
                onChange({ ...draft, model });
                setOpen(false);
              }}
            />
          ))}
        </ChooserPanel>
      ) : null}
    </div>
  );
}
