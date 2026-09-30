/** 侧栏菜单。已去掉活动、积分、本地工作区，以及自定义菜单。 */

/** 还没有后端的入口保持可见，但不能点，右侧带「即将」标签。 */
export const GREYED_NAV_LABELS = new Set<string>(["项目", "专家", "定时任务", "资料库"]);

/** lucide 图标名，侧栏按名字取图标，上报给基座的菜单也用同一个名字。 */
export type NavIcon = "list-checks" | "bot" | "folder-kanban" | "graduation-cap" | "sparkles" | "plug" | "clock" | "library";

export const PRIMARY_NAV = [
  { to: "/tasks", label: "任务", end: true, icon: "list-checks", group: "工作台" },
  { to: "/assistants", label: "助理", end: false, icon: "bot", group: "工作台" },
  { to: "/projects", label: "项目", end: false, icon: "folder-kanban", group: "工作台" },
  { to: "/experts", label: "专家", end: true, icon: "graduation-cap", group: "扩展" },
  { to: "/experts/skills", label: "技能", end: false, icon: "sparkles", group: "扩展" },
  { to: "/experts/connectors", label: "连接器", end: false, icon: "plug", group: "扩展" },
  { to: "/automation", label: "定时任务", end: false, icon: "clock", group: "自动化与资料" },
  { to: "/library", label: "资料库", end: false, icon: "library", group: "自动化与资料" },
] as const satisfies readonly { to: string; label: string; end: boolean; icon: NavIcon; group: string }[];

export const SETTINGS_NAV = [
  {
    group: "个人设置",
    items: ["个人主页", "语言", "主题"],
  },
] as const;

/** 嵌入 wujie 时上报给基座的菜单目录。未接入的入口不上报。 */
export function menuSections() {
  const items = PRIMARY_NAV.filter((item) => !GREYED_NAV_LABELS.has(item.label)).map((item) => ({
    key: item.to,
    href: item.to,
    title: item.label,
    icon: item.icon,
  }));
  return [{ group: "orbit", groupTitle: "Orbit", items }];
}
