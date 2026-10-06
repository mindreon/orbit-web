import { ChevronDown, Cpu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { usePopoverClose } from "../../lib/usePopoverClose";
import type { ConfigDraft } from "../../lib/taskConfig";
import type { ConfigCatalog } from "../../lib/configCatalog";
import { listModels } from "../../lib/catalog";
import { ChooserPanel } from "../../ui/ChooserPanel";
import { Option } from "../../ui/Option";

/**
 * 输入框下方的模型选择，像 WorkBuddy 那个位置。候选从部署的模型目录（`GET /v1/models`，ORBIT_MODELS）来；
 * 目录没配时退回用自己专家配置过的模型。不选（默认模型）就按专家配置的模型跑，专家没有的用部署默认
 * （`ORBIT_MODEL_NAME`）。`compact`：输入框窄的时候只留图标，模型名放在无障碍标签里。
 */
export function ModelSelector({ draft, onChange, catalog, disabled = false, compact = false, openSignal = 0 }: { draft: ConfigDraft; onChange: (next: ConfigDraft) => void; catalog: ConfigCatalog; disabled?: boolean; compact?: boolean; /** 每加一就打开（输入框里的 / 模型）。 */ openSignal?: number }) {
  const [open, setOpen] = useState(false);
  // 后端返回的模型目录；null 是还没读到。读到了就用它（哪怕为空——部署说了算），读不到再用专家的模型凑。
  const [models, setModels] = useState<readonly string[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  usePopoverClose(open, box, () => setOpen(false));
  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open || models !== null) return;
    let gone = false;
    listModels()
      .then((body) => !gone && setModels(body.items ?? []))
      .catch(() => !gone && setModels([]));
    return () => {
      gone = true;
    };
  }, [open, models]);

  // 目录没配（或还没读到）时的兜底：自己专家配置过的模型。
  const fromExperts = useMemo(() => [...new Set(catalog.experts.map((expert) => expert.model).filter(Boolean))].sort(), [catalog.experts]);
  const options = models === null ? fromExperts : models;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        data-testid="model-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={`模型：${draft.model || "默认模型"}`}
        className={cn("flex h-8 items-center gap-1.5 rounded-control text-body text-gray-600 hover:bg-gray-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50", compact ? "w-8 justify-center" : "px-2")}
        onClick={() => setOpen((value) => !value)}
      >
        <Cpu aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className={compact ? "sr-only" : "max-w-40 truncate"}>{draft.model || "默认模型"}</span>
        {compact ? null : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {open ? (
        <ChooserPanel label="模型" className={cn("bottom-full mb-2 w-64 max-w-[calc(100vw-2rem)]", compact ? "right-0" : "left-0")}>
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
          {options.map((model) => (
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
          {models !== null && models.length === 0 && fromExperts.length === 0 ? (
            <p className="px-3 py-2 text-caption text-muted-foreground">这个部署还没有配置模型目录（ORBIT_MODELS）。</p>
          ) : null}
        </ChooserPanel>
      ) : null}
    </div>
  );
}
