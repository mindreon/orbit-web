/** 侧栏菜单，和 WorkBuddy 一致：新建任务、专家·技能·连接器、项目、定时任务、资料库。 */

/** 还没有后端的入口保持可见，但不能点，右侧带「即将」标签。 */
export const GREYED_NAV_LABELS = new Set<string>(["项目", "定时任务", "资料库"]);

/** lucide 图标名，侧栏按名字取图标，上报给基座的菜单也用同一个名字。 */
export type NavIcon = "square-pen" | "graduation-cap" | "sparkles" | "plug" | "folder-kanban" | "clock" | "library";

export interface NavChild {
  readonly to: string;
  readonly label: string;
  readonly end: boolean;
  readonly icon: NavIcon;
}

export interface NavItem extends NavChild {
  /** 有子项时，悬停会弹出子菜单；点主项进入第一个子项。 */
  readonly children?: readonly NavChild[];
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "新建任务", end: true, icon: "square-pen" },
  {
    to: "/experts",
    label: "专家·技能·连接器",
    end: false,
    icon: "graduation-cap",
    children: [
      { to: "/experts", label: "专家", end: true, icon: "graduation-cap" },
      { to: "/experts/skills", label: "技能", end: false, icon: "sparkles" },
      { to: "/experts/connectors", label: "连接器", end: false, icon: "plug" },
    ],
  },
  { to: "/projects", label: "项目", end: false, icon: "folder-kanban" },
  { to: "/automation", label: "定时任务", end: false, icon: "clock" },
  { to: "/library", label: "资料库", end: false, icon: "library" },
];

export const SETTINGS_NAV = [
  {
    group: "个人设置",
    items: ["个人主页", "语言", "主题"],
  },
] as const;

/** 嵌入 wujie 时上报给基座的菜单目录。未接入的入口不上报，有子项的展开成子项。 */
export function menuSections() {
  const items = PRIMARY_NAV.filter((item) => !GREYED_NAV_LABELS.has(item.label))
    .flatMap((item) => item.children ?? [item])
    .map((item) => ({ key: item.to, href: item.to, title: item.label, icon: item.icon }));
  return [{ group: "orbit", groupTitle: "Orbit", items }];
}
