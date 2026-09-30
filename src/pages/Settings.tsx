import { useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { cn } from "../lib/cn";
import { getUiPrefs, setUiPrefs, subscribeUiPrefs } from "../lib/uiPrefs";
import { SETTINGS_NAV } from "../shell/nav";
import { Button } from "../ui/Button";
import { PageBody, PageHeader } from "../ui/PageHeader";
import { panelClass } from "../ui/card";
import { SegmentedTabs } from "../ui/Tabs";

function knownSection(value: string | null) {
  const items = SETTINGS_NAV.flatMap((group) => [...group.items]);
  return value && items.includes(value as (typeof items)[number]) ? value : "个人主页";
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = knownSection(params.get("section"));
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="设置" />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-auto border-r border-border bg-card p-3 md:block">
          {SETTINGS_NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <p className="mb-1 px-3 text-xs text-muted-foreground">{group.group}</p>
              {group.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn("flex h-9 w-full items-center rounded-lg px-3 text-left text-sm", section === item ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-secondary")}
                  onClick={() => setParams(item === "个人主页" ? {} : { section: item })}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <PageBody narrow>
          <h2 className="mb-4 text-base font-semibold text-foreground">{section}</h2>
          <SettingsBody section={section} />
        </PageBody>
      </div>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className={cn(panelClass, "flex items-center gap-4 p-4")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

const THEMES = [
  { id: "浅色", label: "浅色" },
  { id: "深色", label: "深色" },
] as const;

/** 预览色块故意写死：它展示的是另一套主题，不该跟当前主题变。 */
const PREVIEW = { 浅色: "bg-white text-neutral-900", 深色: "bg-[#1c1c1e] text-white" } as const;

function SettingsBody({ section }: { section: string }) {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);

  if (section === "个人主页") {
    return (
      <div className="space-y-3">
        <Row title="昵称" hint="经办人">
          <Button size="sm" disabled title="后端还没有接入">
            修改昵称
          </Button>
        </Row>
      </div>
    );
  }

  if (section === "语言") {
    return (
      <div className="space-y-3">
        <Row title="显示语言" hint="设置应用程序界面的显示语言。">
          <span className="text-sm text-foreground">简体中文</span>
        </Row>
      </div>
    );
  }

  if (section === "主题") {
    return (
      <div className="space-y-3">
        <Row title="外观" hint="经典明暗，简约耐看。">
          <SegmentedTabs label="外观" value={uiPrefs.theme} options={THEMES} onChange={(theme) => setUiPrefs({ theme })} />
        </Row>
        <div className={cn(panelClass, "p-4")}>
          <p className="text-sm font-medium text-foreground">效果预览</p>
          <div className={cn("mt-3 rounded-lg border border-border p-4 text-sm", PREVIEW[uiPrefs.theme])}>界面主题</div>
        </div>
        <Row title="个性主题" hint="换个皮肤，换种心情，敬请期待。" />
      </div>
    );
  }

  return null;
}
