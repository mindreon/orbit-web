/** 侧栏菜单。已去掉活动、积分，以及本地工作区入口。 */

/** Sidebar entries that stay visible in P0 but must not navigate or call APIs. */
export const GREYED_NAV_LABELS = new Set<string>([
  "助理",
  "项目",
  "专家·技能·连接器",
  "定时任务",
  "资料库",
]);

export const PRIMARY_NAV = [
  { to: "/", label: "新建任务", end: true },
  { to: "/assistants", label: "助理", end: false },
  { to: "/projects", label: "项目", end: false },
  { to: "/experts", label: "专家·技能·连接器", end: false },
  { to: "/automation", label: "定时任务", end: false },
  { to: "/library", label: "资料库", end: false },
] as const;

export const EXPERT_TABS = [
  { to: "/experts", label: "专家", end: true },
  { to: "/experts/skills", label: "技能", end: false },
  { to: "/experts/connectors", label: "连接器", end: false },
] as const;

export const SKILL_TABS = ["推荐", "套件", "企业 Skill", "已安装"] as const;

export const SETTINGS_NAV = [
  {
    group: "个人设置",
    items: ["个人主页", "语言", "主题"],
  },
] as const;

export const OFFICE_CHIPS = ["文档处理", "金融服务", "数据分析及可视化", "个人工作台", "幻灯片", "深度研究"] as const;
export const CODE_CHIPS = ["日常开发", "网站开发", "Skill 开发", "Agent 应用", "CI/CD"] as const;
export const DESIGN_CHIPS = ["PPT设计", "视觉海报", "品牌设计", "图标插画", "网站设计"] as const;

export const SCENES = [
  { id: "work", label: "日常办公", subtitle: "你的职场超能力", chips: OFFICE_CHIPS },
  { id: "code", label: "代码开发", subtitle: "你的开发超能力", chips: CODE_CHIPS },
  { id: "design", label: "设计创意", subtitle: "你的设计超能力", chips: DESIGN_CHIPS },
] as const;
