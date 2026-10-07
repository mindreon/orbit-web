/** 侧栏菜单：新建任务、专家、技能、连接器、项目、定时任务、资料库。专家即 ModelScope 智能体目录。 */

/** lucide 图标名，侧栏按名字取图标，上报给基座的菜单也用同一个名字。 */
export type NavIcon = "square-pen" | "sparkles" | "bot" | "plug" | "folder-kanban" | "clock" | "library";

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly end: boolean;
  readonly icon: NavIcon;
  /** 后端还没接入：入口照常显示、能点进去，页面写明「即将开放」，侧栏里带一个「即将」标签。 */
  readonly soon?: boolean;
  /** 侧栏分组。缺省的项渲染在所有分组之前（主行动区）。 */
  readonly group?: NavGroupId;
}

export type NavGroupId = "resource" | "extension";

/** 侧栏分组的展示名，按 NAV 里的出现顺序渲染。 */
export const NAV_GROUPS: readonly { id: NavGroupId; label: string }[] = [
  { id: "resource", label: "资源" },
  { id: "extension", label: "扩展" },
];

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "新建任务", end: true, icon: "square-pen" },
  { to: "/experts/agents", label: "专家", end: false, icon: "bot", group: "resource" },
  { to: "/experts/skills", label: "技能", end: false, icon: "sparkles", group: "resource" },
  { to: "/experts/connectors", label: "连接器", end: false, icon: "plug", group: "resource" },
  { to: "/projects", label: "项目", end: false, icon: "folder-kanban", soon: true, group: "extension" },
  { to: "/automation", label: "定时任务", end: false, icon: "clock", soon: true, group: "extension" },
  { to: "/library", label: "资料库", end: false, icon: "library", soon: true, group: "extension" },
];

export const SETTINGS_NAV = [
  {
    group: "个人设置",
    items: ["个人主页", "语言", "主题", "权限"],
  },
] as const;

/** 嵌入 wujie 时上报给基座的菜单目录，和侧栏的入口一致。 */
export function menuSections() {
  const items = PRIMARY_NAV.map((item) => ({ key: item.to, href: item.to, title: item.label, icon: item.icon }));
  return [{ group: "orbit", groupTitle: "Orbit", items }];
}
