import { useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Check, Languages, Palette, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { getUiPrefs, setUiPrefs, subscribeUiPrefs, type ThemeName } from "../lib/uiPrefs";
import { PermissionsSection } from "../components/permissions/PermissionsSection";
import { SETTINGS_NAV } from "../shell/nav";
import { Button } from "../ui/Button";
import { PageBody, PageHeader } from "../ui/PageHeader";
import { panelClass } from "../ui/card";
import { Switch } from "../ui/Switch";
import { SegmentedTabs } from "../ui/Tabs";

const SECTION_ICONS: Record<string, LucideIcon> = {
  个人主页: UserRound,
  语言: Languages,
  主题: Palette,
  权限: ShieldCheck,
};

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
        <aside className="hidden w-56 shrink-0 overflow-auto bg-card p-3 md:block">
          {SETTINGS_NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <p className="mb-1 px-3 text-caption font-medium text-gray-500">{group.group}</p>
              {group.items.map((item) => {
                const Icon = SECTION_ICONS[item];
                return (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-control px-3 text-left text-body transition-colors",
                      section === item ? "bg-accent font-medium text-accent-foreground" : "text-gray-700 hover:bg-gray-100",
                    )}
                    onClick={() => setParams(item === "个人主页" ? {} : { section: item })}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    {item}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
        <PageBody narrow>
          {/* 窄屏没有左边的分组栏，用分段控件切换 */}
          <div className="mb-4 md:hidden">
            <SegmentedTabs label="设置分组" value={section} options={SETTINGS_NAV.flatMap((group) => group.items.map((item) => ({ id: item as string, label: item as string })))} onChange={(id) => setParams(id === "个人主页" ? {} : { section: id })} />
          </div>
          <h2 className="mb-4 text-title font-semibold text-foreground">{section}</h2>
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
        <p className="text-body font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-0.5 text-small text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

const THEMES = [
  { id: "浅色", label: "浅色" },
  { id: "深色", label: "深色" },
] as const;

/**
 * 迷你预览里的颜色故意写死：每张卡展示的是它代表的主题，不跟当前主题变。
 * 关键色取自 index.css 里两套 token 的主色，方便对照。
 */
const MINI = {
  浅色: {
    frame: "border-neutral-200 bg-white",
    bar: "border-neutral-100",
    dot: "bg-neutral-200",
    lineDim: "bg-neutral-100",
    line: "bg-neutral-200",
    navActive: "bg-blue-500/15",
    button: "bg-[hsl(219_92%_57%)]",
  },
  深色: {
    frame: "border-neutral-700 bg-[#1c1c1e]",
    bar: "border-neutral-700/70",
    dot: "bg-neutral-600",
    lineDim: "bg-neutral-700",
    line: "bg-neutral-600",
    navActive: "bg-blue-400/25",
    button: "bg-[hsl(219_92%_62%)]",
  },
} as const;

/** 可点击的迷你主题预览卡：点哪张就切到哪套主题。 */
function ThemePreviewCard({ theme, selected }: { theme: ThemeName; selected: boolean }) {
  const mini = MINI[theme];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => setUiPrefs({ theme })}
      className={cn(
        "flex-1 rounded-card border-2 p-2 text-left transition-colors",
        selected ? "border-primary" : "border-transparent hover:border-border",
      )}
    >
      <div className={cn("overflow-hidden rounded-control border", mini.frame)}>
        <div className={cn("flex items-center gap-1.5 border-b px-2 py-1.5", mini.bar)}>
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", mini.dot)} />
          <span aria-hidden="true" className={cn("h-2 w-10 rounded-full", mini.lineDim)} />
        </div>
        <div className="flex gap-2.5 p-2.5">
          <div className="w-9 shrink-0 space-y-1.5" aria-hidden="true">
            <span className={cn("block h-1.5 w-full rounded-full", mini.navActive)} />
            <span className={cn("block h-1.5 w-full rounded-full", mini.lineDim)} />
            <span className={cn("block h-1.5 w-4/5 rounded-full", mini.lineDim)} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5" aria-hidden="true">
            <span className={cn("block h-1.5 w-3/4 rounded-full", mini.line)} />
            <span className={cn("block h-1.5 w-full rounded-full", mini.lineDim)} />
            <span className={cn("block h-1.5 w-2/3 rounded-full", mini.lineDim)} />
            <span className={cn("mt-2 block h-4 w-12 rounded-control", mini.button)} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 px-1 pb-1">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {selected ? <Check className="h-3 w-3" /> : null}
        </span>
        <span className="text-body text-foreground">{theme}</span>
      </div>
    </button>
  );
}

function SettingsBody({ section }: { section: string }) {
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);

  if (section === "个人主页") {
    return (
      <div className="space-y-3">
        <div className={cn(panelClass, "flex items-center gap-4 p-5")}>
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-primary text-heading font-semibold text-primary-foreground"
          >
            经
          </span>
          <div className="min-w-0">
            <p className="text-title font-semibold text-foreground">经办人</p>
            <p className="mt-0.5 text-small text-muted-foreground">本地部署 · default 租户</p>
          </div>
        </div>
        <Row title="昵称" hint="经办人">
          <Button size="sm" disabled title="后端还没有接入">
            修改昵称
          </Button>
        </Row>
        <Row title="开发者模式" hint="打开后，任务页右侧多出计划图、执行记录、事件日志、完整用量和思考过程。">
          <Switch label="开发者模式" checked={uiPrefs.developer} onChange={(developer) => setUiPrefs({ developer })} />
        </Row>
      </div>
    );
  }

  if (section === "权限") return <PermissionsSection />;

  if (section === "语言") {
    return (
      <div className="space-y-3">
        <Row title="显示语言" hint="设置应用程序界面的显示语言。">
          <span className="text-body text-foreground">简体中文</span>
        </Row>
      </div>
    );
  }

  if (section === "主题") {
    return (
      <div className="space-y-3">
        <div className={cn(panelClass, "p-4")}>
          <p className="text-body font-medium text-foreground">外观</p>
          <p className="mt-0.5 text-small text-muted-foreground">点选一套主题，立即生效，刷新后保持。</p>
          <div className="mt-3 flex gap-3">
            {THEMES.map((item) => (
              <ThemePreviewCard key={item.id} theme={item.id} selected={uiPrefs.theme === item.id} />
            ))}
          </div>
        </div>
        <Row title="个性主题" hint="换个皮肤，换种心情，敬请期待。" />
      </div>
    );
  }

  return null;
}
