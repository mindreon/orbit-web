import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { cn } from "../lib/cn";
import { getUiPrefs, setUiPrefs, subscribeUiPrefs } from "../lib/uiPrefs";
import { SETTINGS_NAV } from "../shell/nav";

function knownSection(value: string | null) {
  const items = SETTINGS_NAV.flatMap((group) => [...group.items]);
  return value && items.includes(value as (typeof items)[number]) ? value : "个人主页";
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = knownSection(params.get("section"));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] bg-[#f7f7f8]">
      <aside className="overflow-auto border-r border-[#ececee] p-4">
        {SETTINGS_NAV.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="mb-1 px-2 text-xs text-[#999]">{group.group}</p>
            {group.items.map((item) => (
              <button
                key={item}
                className={cn("block w-full rounded-lg px-2 py-1.5 text-left text-sm", section === item ? "bg-white font-medium" : "text-[#444]")}
                onClick={() => setParams(item === "个人主页" ? {} : { section: item })}
              >
                {item}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="overflow-auto p-8">
        <h1 className="text-xl font-semibold">{section}</h1>
        <SettingsBody section={section} />
      </div>
    </div>
  );
}

function SettingsBody({ section }: { section: string }) {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);

  if (section === "个人主页") {
    return (
      <div className="mt-6 max-w-lg space-y-4 text-sm">
        <div className="rounded-xl bg-white p-4">
          <p className="text-xs text-[#999]">昵称</p>
          <div className="mt-2 flex items-center">
            <span>经办人</span>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="ml-auto cursor-not-allowed text-[#b0b0b0] disabled:cursor-not-allowed"
            >
              修改昵称 · 未接入
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (section === "语言") {
    return (
      <div className="mt-6 max-w-lg space-y-3 text-sm">
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">显示语言</p>
          <p className="mt-1 text-[#888]">设置应用程序界面的显示语言。</p>
          <p className="mt-2">简体中文</p>
        </div>
      </div>
    );
  }

  if (section === "主题") {
    return (
      <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">基础</p>
          <p className="mt-1 text-sm text-[#888]">经典明暗，简约耐看</p>
          <div className="mt-3 flex gap-2">
            {(["浅色", "深色"] as const).map((item) => (
              <button key={item} type="button" className={cn("rounded-lg px-3 py-1 text-sm", uiPrefs.theme === item ? "bg-[#1a1a1a] text-white" : "bg-[#f3f3f4]")} onClick={() => setUiPrefs({ theme: item })}>
                {item}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#999]">永久有效</p>
          <p className="mt-3 text-xs text-[#888]">效果预览</p>
          <div className={cn("mt-1 rounded-lg border border-[#e6e6e8] p-3 text-sm", uiPrefs.theme === "深色" ? "bg-[#1c1c1e] text-white" : "bg-white text-[#1a1a1a]")}>界面主题</div>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">个性</p>
          <p className="mt-1 text-sm text-[#888]">换个皮肤，换种心情</p>
          <p className="mt-3 text-sm text-[#888]">全部主题 · 敬请期待</p>
        </div>
      </div>
    );
  }

  return null;
}
