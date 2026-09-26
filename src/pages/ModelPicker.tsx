import { useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { MODEL_EFFORTS, type ModelEffort, getCustomModels, subscribeCustomModels } from "../lib/customModels";

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const navigate = useNavigate();
  const models = useSyncExternalStore(subscribeCustomModels, getCustomModels, getCustomModels);
  const visible = models.filter((item) => !item.hidden);
  const selected = visible.find((item) => item.id === value);
  const efforts = selected?.supportedEfforts ?? [];
  const [open, setOpen] = useState(false);
  const [effort, setEffort] = useState<ModelEffort | "">("");

  return (
    <div className="relative">
      <button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-[#f3f3f4]" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {value} ▾
      </button>
      {efforts.length > 0
        ? efforts.map((id) => {
            const label = MODEL_EFFORTS.find((item) => item.id === id)?.label ?? id;
            return (
              <button key={id} type="button" aria-label={label} aria-pressed={effort === id} className="rounded-md px-2 py-1 text-xs hover:bg-[#f3f3f4]" onClick={() => setEffort(id)}>
                {label}
              </button>
            );
          })
        : null}
      {open ? (
        <div className="absolute bottom-9 left-0 z-20 w-64 rounded-xl border border-[#ececee] bg-white p-2 text-sm shadow-lg">
          <p className="px-2 py-1 text-xs text-[#999]">内置模型</p>
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]"
            onClick={() => {
              onChange("Auto");
              setEffort("");
              setOpen(false);
            }}
          >
            Auto
          </button>
          <p className="mt-2 px-2 py-1 text-xs text-[#999]">自定义模型</p>
          {visible.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">还没有配置自定义模型</p> : null}
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]"
              onClick={() => {
                onChange(item.id);
                setEffort(item.defaultEffort && item.supportedEfforts.includes(item.defaultEffort) ? item.defaultEffort : "");
                setOpen(false);
              }}
            >
              {item.id}
            </button>
          ))}
          <button
            type="button"
            className="mt-2 block w-full rounded-lg px-2 py-1.5 text-left text-[#444] hover:bg-[#f6f6f7]"
            onClick={() => navigate("/settings?section=模型")}
          >
            配置自定义模型
          </button>
        </div>
      ) : null}
    </div>
  );
}
