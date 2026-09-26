/** 菜单结构来自本机 WorkBuddy 的侧栏配置。已去掉活动、积分，以及本地工作区入口。 */

export const PRIMARY_NAV = [
  { to: "/", label: "新建任务", end: true },
  { to: "/assistants", label: "助理", end: false },
  { to: "/projects", label: "项目", end: false },
  { to: "/experts", label: "专家·技能·连接器", end: false },
  { to: "/automation", label: "定时任务", end: false },
  { to: "/library", label: "资料库", end: false },
] as const;

export const MORE_NAV = [
  { to: "/files", label: "我的文件" },
  { to: "/mail", label: "我的邮箱" },
  { to: "/docs", label: "腾讯文档" },
  { to: "/ima", label: "ima" },
  { to: "/lexiang", label: "乐享知识库" },
  { to: "/inspiration", label: "灵感" },
] as const;

export const EXPERT_TABS = [
  { to: "/experts", label: "专家", end: true },
  { to: "/experts/skills", label: "技能", end: false },
  { to: "/experts/connectors", label: "连接器", end: false },
] as const;

export const SKILL_TABS = ["推荐", "SkillHub", "套件", "Knot", "企业 Skill", "已安装"] as const;

export const SETTINGS_NAV = [
  {
    group: "设置",
    items: ["个人主页", "外观", "通用", "快捷键", "个性化"],
  },
  {
    group: "功能",
    items: ["连接器", "智能体", "记忆与进化", "模型", "应用管理"],
  },
  {
    group: "数据与安全",
    items: ["数据管理", "安全中心"],
  },
  {
    group: "关于我们",
    items: ["关于", "获取帮助"],
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
