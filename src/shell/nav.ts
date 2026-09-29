/** 侧栏菜单。已去掉活动、积分、本地工作区，以及自定义菜单。 */

/** 还没有后端的入口保持可见，但不能点，文案带「未接入」。 */
export const GREYED_NAV_LABELS = new Set<string>([
  "项目",
  "专家",
  "定时任务",
  "资料库",
]);

export const PRIMARY_NAV = [
  { to: "/tasks", label: "任务", end: true },
  { to: "/assistants", label: "助理", end: false },
  { to: "/projects", label: "项目", end: false },
  { to: "/experts", label: "专家", end: true },
  { to: "/experts/skills", label: "技能", end: false },
  { to: "/experts/connectors", label: "连接器", end: false },
  { to: "/automation", label: "定时任务", end: false },
  { to: "/library", label: "资料库", end: false },
] as const;

export const SETTINGS_NAV = [
  {
    group: "个人设置",
    items: ["个人主页", "语言", "主题"],
  },
] as const;
