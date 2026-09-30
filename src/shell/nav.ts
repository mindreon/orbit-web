/** 侧栏菜单：新建任务、专家、技能、连接器、项目、定时任务、资料库。三个目录各占一项，去处一眼可见。 */

/** 还没有后端的入口：侧栏和上报给基座的菜单里都不显示，路由还在，直接输入地址能看到「即将开放」。接入后端后从这里去掉即可。 */
export const GREYED_NAV_LABELS = new Set<string>(["项目", "定时任务", "资料库"]);

/** lucide 图标名，侧栏按名字取图标，上报给基座的菜单也用同一个名字。 */
export type NavIcon = "square-pen" | "graduation-cap" | "sparkles" | "plug" | "folder-kanban" | "clock" | "library";

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly end: boolean;
  readonly icon: NavIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "新建任务", end: true, icon: "square-pen" },
  { to: "/experts", label: "专家", end: true, icon: "graduation-cap" },
  { to: "/experts/skills", label: "技能", end: false, icon: "sparkles" },
  { to: "/experts/connectors", label: "连接器", end: false, icon: "plug" },
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

/** 嵌入 wujie 时上报给基座的菜单目录。未接入的入口不上报。 */
export function menuSections() {
  const items = PRIMARY_NAV.filter((item) => !GREYED_NAV_LABELS.has(item.label)).map((item) => ({ key: item.to, href: item.to, title: item.label, icon: item.icon }));
  return [{ group: "orbit", groupTitle: "Orbit", items }];
}
