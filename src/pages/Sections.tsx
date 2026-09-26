import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router";
import { EXPERT_TABS, SETTINGS_NAV, SKILL_TABS } from "../shell/nav";
import { useMind } from "../store";
import { disconnectBuddyApp, getBuddyApps, subscribeBuddyApps } from "../lib/buddyApps";
import { assignShortcut, chordFromEvent, getShortcuts, resetAllShortcuts, resetShortcut, setShortcutCapture, shortcutProblem, subscribeShortcuts } from "../lib/shortcuts";
import { getUiPrefs, setUiPrefs, subscribeUiPrefs, type FontSize, type LinkOpen, type TipSound } from "../lib/uiPrefs";
import { getCustomModels, subscribeCustomModels } from "../lib/customModels";
import { cancelSharedFile, cancelSharedTask, getSharedFiles, getSharedTasks, refreshSharedFile, subscribeShares } from "../lib/shares";
import { getPublishedApps, subscribePublishedApps, unpublishApp } from "../lib/publishedApps";
import { ModelsPanel } from "./ModelsPanel";
import { cn } from "../lib/cn";
import { getConnectorOverrides, isConnectorLinked, setConnectorLinked, subscribeConnectorLinks } from "../lib/connectorLinks";
import { getHandoffs, subscribeHandoffs, updateHandoff } from "../lib/handoffs";
import type { McpTool } from "../model";

function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f8] px-8 py-6">
      <h1 className="text-xl font-semibold text-[#1a1a1a]">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-[#888]">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Search({ label, value, onValue }: { label: string; value?: string; onValue?: (value: string) => void }) {
  const [inner, setInner] = useState("");
  const current = value ?? inner;
  return (
    <input
      value={current}
      aria-label={label}
      placeholder={label}
      className="mb-4 h-9 w-full max-w-md rounded-lg border border-[#e6e6e8] bg-white px-3 text-sm outline-none"
      onChange={(event) => {
        const next = event.target.value;
        if (onValue) onValue(next);
        else setInner(next);
      }}
    />
  );
}

const ROLE_PRESETS = [
  { name: "前端开发工程师", desc: "负责前端界面设计与实现，擅长组件架构、交互细节、响应式适配和性能优化，保障体验稳定。持续沉淀最佳实践。" },
  { name: "AI工程师", desc: "负责大模型应用与智能体开发，擅长 RAG、提示工程、流程编排和效果调优，推动 AI 能力落地业务。持续沉淀工程实践。" },
  { name: "项目经理", desc: "负责计划排期、资源协调和风险管理，擅长跨团队推进、进度跟踪和按期交付保障。持续同步里程碑、风险和资源变化。" },
  { name: "UI设计师", desc: "负责界面视觉、组件规范和设计交付，擅长布局、色彩、图标和细节打磨，提升产品质感。持续沉淀规范，保障体验一致。" },
  { name: "高级开发工程师", desc: "负责复杂模块设计与技术攻坚，擅长架构权衡、性能优化、高并发处理和疑难问题定位，保障高质量交付。持续沉淀技术方案。" },
  { name: "数据分析员", desc: "负责指标体系、数据看板和专题分析，擅长发现业务问题、验证假设并输出清晰决策建议。持续沉淀分析方法，推动业务增长。" },
  { name: "工程测试员", desc: "负责测试方案、用例设计和缺陷跟踪，擅长自动化验证、风险识别和上线质量保障。持续沉淀测试资产，提升交付信心。" },
  { name: "自定义", desc: "自由定义职称与简介" },
] as const;

const DUTIES = ["需求分析", "方案拆解", "报告生成", "质量评审"] as const;

type CloudAssistant = { name: string; duty: string; role: string; online: boolean };

function HireExpertList({ items, onPick }: { items: { id: string; name: string; duty: string }[]; onPick: (agent: { name: string; duty: string }) => void }) {
  if (items.length === 0) {
    return (
      <div className="mt-2 text-xs text-[#888]">
        <p>暂无匹配结果</p>
        <p className="mt-1">换个关键词或分类试试</p>
      </div>
    );
  }
  return (
    <ul className="mt-2 space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="w-full rounded-lg bg-white px-2 py-1.5 text-left text-sm" onClick={() => onPick(item)}>
            {item.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AssistantsPage() {
  const navigate = useNavigate();
  const [assistantParams] = useSearchParams();
  const catalog = useMind((s) => s.catalog);
  const [group, setGroup] = useState<"普通助理" | "企业智能体">(assistantParams.get("group") === "企业智能体" ? "企业智能体" : "普通助理");
  const [statusFilter, setStatusFilter] = useState<"全部" | "异常">("全部");
  const [moreRoles, setMoreRoles] = useState(false);
  const [open, setOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [hireTab, setHireTab] = useState<"专家" | "专家团" | "企业智能体">("专家");
  const [hireQuery, setHireQuery] = useState("");
  const [step, setStep] = useState<"基本信息" | "能力配置">("基本信息");
  const [nickname, setNickname] = useState("");
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [duties, setDuties] = useState<string[]>([]);
  const [style, setStyle] = useState("");
  const [base, setBase] = useState("");
  const [model, setModel] = useState("Auto");
  const customModels = useSyncExternalStore(subscribeCustomModels, getCustomModels, getCustomModels);
  const [created, setCreated] = useState<CloudAssistant[]>([
    { name: "产品经理", duty: "擅长架构设计与工程实现，交付高质量代码与技术方案。", role: "产品经理", online: true },
  ]);
  const visibleRoles = moreRoles ? ROLE_PRESETS : ROLE_PRESETS.slice(0, 4).concat(ROLE_PRESETS[ROLE_PRESETS.length - 1]);
  const people = created.filter((item) => (statusFilter === "异常" ? !item.online : true));

  function fillExample() {
    setNickname("小林");
    setRoleName("前端开发工程师");
    setDescription(ROLE_PRESETS[0].desc);
  }

  function resetForm() {
    setNickname("");
    setRoleName("");
    setDescription("");
    setDuties([]);
    setStyle("");
    setBase("");
    setModel("Auto");
    setStep("基本信息");
    setHireOpen(false);
    setHireQuery("");
  }

  return (
    <Page title="助理" subtitle="7 × 24 小时在线干活，多任务并行处理，和助理一起高效协作">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(["普通助理", "企业智能体"] as const).map((item) => (
          <button key={item} type="button" className={cn("rounded-full px-3 py-1", group === item ? "bg-[#1a1a1a] text-white" : "bg-white")} onClick={() => setGroup(item)}>
            {item}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#888]">{people.length} 位 · 0 工作中</span>
      </div>
      {group === "企业智能体" ? <p className="text-sm text-[#888]">暂无企业智能体。</p> : null}
      {group === "普通助理" ? (
        <>
          <div className="mb-3 flex gap-2 text-sm">
            <span className="text-[#888]">筛选助理状态</span>
            {(["全部", "异常"] as const).map((item) => (
              <button key={item} type="button" className={cn("rounded-full px-3 py-1", statusFilter === item && "bg-white font-medium")} onClick={() => setStatusFilter(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-xl border border-dashed border-[#d8d8dc] bg-white p-4 text-left"
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              <p className="text-sm font-medium">创建助理</p>
              <p className="mt-1 text-sm text-[#888]">组建你的团队</p>
            </button>
            {people.map((agent) => (
              <article key={agent.name} className="rounded-xl border border-[#ececee] bg-white p-4" aria-label={`${agent.name} 的助理名片`}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{agent.name}</p>
                  <span className="rounded-full bg-[#f3f3f4] px-2 py-0.5 text-xs">☁ 云端</span>
                </div>
                <p className="mt-1 text-xs text-[#12b981]">{agent.online ? "在线" : "异常"}</p>
                <p className="mt-2 text-sm leading-6 text-[#666]">{agent.duty}</p>
                <p className="mt-2 text-xs text-[#888]">待命 · 空闲中，可派单</p>
                <button type="button" className="mt-3 text-sm" onClick={() => navigate(`/?prompt=${encodeURIComponent(`@${agent.name} `)}`)}>
                  对话
                </button>
              </article>
            ))}
          </div>
          {people.length === 0 ? <p className="mt-3 text-sm text-[#888]">暂无助理。</p> : null}
        </>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === "基本信息") {
                setStep("能力配置");
                return;
              }
              if (!nickname.trim()) return;
              setCreated((items) => [{ name: nickname.trim(), duty: description || roleName || "云端助理", role: roleName, online: true }, ...items]);
              resetForm();
              setOpen(false);
            }}
          >
            <h2 className="text-base font-semibold">创建助理</h2>
            <p className="mt-1 text-xs text-[#888]">{step === "基本信息" ? "基本信息" : "能力配置（高级）"}</p>
            {step === "基本信息" ? (
              <div className="mt-3 rounded-xl bg-[#f7f7f8] p-3">
                <button type="button" className="text-sm font-medium" onClick={() => setHireOpen((value) => !value)}>
                  雇佣专家
                </button>
                {hireOpen ? (
                  <>
                    <p className="mt-1 text-xs text-[#888]">从专家、专家团或企业智能体中选 1 个来源，带入能力、技能和方法论</p>
                    <div className="mt-2 flex gap-2">
                      {(["专家", "专家团", "企业智能体"] as const).map((item) => (
                        <button key={item} type="button" className={cn("rounded-full px-2 py-1 text-xs", hireTab === item && "bg-white font-medium")} onClick={() => { setHireTab(item); setHireQuery(""); }}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <input
                      aria-label={hireTab === "专家团" ? "搜索专家团" : hireTab === "企业智能体" ? "搜索企业智能体" : "搜索专家"}
                      placeholder={hireTab === "专家团" ? "搜索专家团" : hireTab === "企业智能体" ? "搜索企业智能体" : "搜索专家"}
                      value={hireQuery}
                      className="mt-2 h-8 w-full rounded-lg border border-[#e6e6e8] px-2 text-sm"
                      onChange={(event) => setHireQuery(event.target.value)}
                    />
                    {hireTab === "专家" ? (
                      <HireExpertList
                        items={catalog.agents.filter((item) => !hireQuery.trim() || item.name.includes(hireQuery.trim()))}
                        onPick={(agent) => {
                          setRoleName(agent.name);
                          setDescription(agent.duty);
                        }}
                      />
                    ) : null}
                    {hireTab === "专家团" ? (
                      <p className="mt-2 text-xs text-[#888]">{hireQuery.trim() ? `没有找到与「${hireQuery.trim()}」匹配的专家团，试试其他关键词` : "暂无专家团"}</p>
                    ) : null}
                    {hireTab === "企业智能体" ? (
                      <div className="mt-2 text-xs text-[#888]">
                        <p>暂无企业智能体</p>
                        <p className="mt-1">当前企业下暂无已发布的企业智能体。</p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            {step === "基本信息" ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1" aria-label="助理职业快捷选项">
                  {visibleRoles.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={cn("rounded-full px-2 py-1 text-xs", roleName === item.name && "bg-[#ececee] font-medium")}
                      onClick={() => {
                        setRoleName(item.name);
                        if (item.name !== "自定义") setDescription(item.desc);
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                  <button type="button" className="rounded-full px-2 py-1 text-xs text-[#666]" onClick={() => setMoreRoles((value) => !value)}>
                    {moreRoles ? "收起" : "查看更多"}
                  </button>
                </div>
                <label className="mt-3 block text-sm">
                  名称
                  <input value={nickname} aria-label="助理名称" placeholder="给他起个好听的名字~" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setNickname(event.target.value)} />
                </label>
                <label className="mt-3 block text-sm">
                  职能
                  <input value={roleName} aria-label="职能" placeholder="例如：前端开发工程师" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setRoleName(event.target.value)} />
                </label>
                <label className="mt-3 block text-sm">
                  助理简介
                  <textarea value={description} aria-label="助理简介" placeholder="描述 TA 的能力和职责..." className="mt-1 h-24 w-full rounded-lg border border-[#e6e6e8] p-3" onChange={(event) => setDescription(event.target.value)} />
                </label>
                <p className="mt-3 text-sm">常用职责</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {DUTIES.map((item) => {
                    const on = duties.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={cn("rounded-full px-2 py-1 text-xs", on ? "bg-[#1a1a1a] text-white" : "bg-[#f3f3f4]")}
                        onClick={() => setDuties((current) => (on ? current.filter((duty) => duty !== item) : [...current, item]))}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block text-sm">
                  协作风格
                  <textarea value={style} aria-label="协作风格" placeholder="例如：主动追问背景，输出结构化结论，语气简洁专业。" className="mt-1 h-16 w-full rounded-lg border border-[#e6e6e8] p-3" onChange={(event) => setStyle(event.target.value)} />
                </label>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium">助理可以连接哪些数据？</p>
                <p className="mt-1 text-xs text-[#888]">为助理绑定资料库，让 TA 在执行任务时可以读取上下文。</p>
                <label className="mt-3 block text-sm">
                  知识库
                  <select aria-label="知识库" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={base} onChange={(event) => setBase(event.target.value)}>
                    <option value="">未选择</option>
                    {catalog.bases.map((item) => (
                      <option key={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-[#888]">连接后可检索文档内容辅助回答</span>
                </label>
                <label className="mt-3 block text-sm">
                  选择模型
                  <select aria-label="选择模型" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={model} onChange={(event) => setModel(event.target.value)}>
                    <option>Auto</option>
                    {customModels
                      .filter((item) => !item.hidden)
                      .map((item) => (
                        <option key={item.id}>{item.id}</option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => (step === "能力配置" ? setStep("基本信息") : setOpen(false))}>
                {step === "能力配置" ? "上一步" : "取消"}
              </button>
              {step === "基本信息" ? (
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={fillExample}>
                  填充示例
                </button>
              ) : null}
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                {step === "基本信息" ? "下一步" : "创建"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}

const PROJECT_TEMPLATES = [
  { title: "产品需求全流程", desc: "从需求规划、PRD 到研发测试验收" },
  { title: "市场调研与竞品分析", desc: "深度调研、竞品拆解、报告评审" },
  { title: "内容运营工作台", desc: "从选题、写稿、审核到发布复盘" },
  { title: "团队知识库", desc: "持续沉淀 SOP、经验和 FAQ" },
  { title: "项目交付", desc: "管理客户需求、计划、风险和周报" },
  { title: "Bug 跟踪/测试验收", desc: "持续跟踪Bug，统一测试用例和验收结论" },
  { title: "自定义", desc: "" },
] as const;

const PLAN_STATUSES = ["待开始", "进行中", "暂停", "完成"] as const;
const PLAN_STATUS_DESC: Record<(typeof PLAN_STATUSES)[number], string> = {
  待开始: "已创建，等待成员认领并开始执行",
  进行中: "正在推进中，关注进度与截止时间",
  暂停: "当前存在阻塞，等待恢复处理",
  完成: "已完成，可回顾产出与变更记录",
};
type PlanStatus = (typeof PLAN_STATUSES)[number];
const PLAN_PRIORITIES = ["未设置", "无", "紧急", "高", "中", "低"] as const;
const PLAN_FIELDS = ["状态", "处理人", "来源", "范围", "优先级", "标签", "标题", "描述", "截止日期"] as const;
const PLAN_OPS = ["包含", "不包含", "是", "不是", "为空", "不为空"] as const;
type PlanCondition = { id: string; field: string; op: string; value: string };
type PlanView = {
  id: string;
  name: string;
  mode: "看板" | "列表" | "表格" | "甘特" | "日历";
  group: "状态" | "处理人" | "不分组";
  order: "不排序" | "优先级" | "更新时间" | "创建时间";
  dir: "升序" | "降序";
  status: "全部状态" | PlanStatus;
  owner: string;
  scope: "全部归属" | "指派给我" | "我创建的";
  source: "全部来源" | "手动创建" | "转交";
  conditions: PlanCondition[];
  conj: "全部条件" | "任一条件";
  fields: string[];
};

function planFieldText(item: ProjectTodo, field: string, role: string) {
  const handedOff = item.id.startsWith("handoff-");
  if (field === "状态") return item.status;
  if (field === "处理人") return item.owner || "未设置";
  if (field === "来源") return handedOff ? "转交" : "手动创建";
  if (field === "范围") return item.owner === role ? "指派给我" : handedOff ? "" : "我创建的";
  if (field === "优先级") return item.priority || "未设置";
  if (field === "标签") return item.tags;
  if (field === "标题") return item.title;
  if (field === "描述") return item.description;
  if (field === "截止日期") return item.due;
  return "";
}

function planConditionHit(item: ProjectTodo, condition: PlanCondition, role: string) {
  const text = planFieldText(item, condition.field, role);
  const empty = text === "" || text === "未设置";
  if (condition.op === "为空") return empty;
  if (condition.op === "不为空") return !empty;
  if (!condition.value) return true;
  if (condition.op === "是") return text === condition.value;
  if (condition.op === "不是") return text !== condition.value;
  if (condition.op === "包含") return text.includes(condition.value);
  if (condition.op === "不包含") return !text.includes(condition.value);
  return true;
}
type ProjectTodo = {
  id: string;
  title: string;
  status: PlanStatus;
  priority: (typeof PLAN_PRIORITIES)[number];
  owner: string;
  description: string;
  due: string;
  tags: string;
  parentId?: string;
};
type PlanComment = { id: string; todoId: string; author: string; body: string; parentId?: string };
type ProjectItem = {
  name: string;
  template: string;
  pinned: boolean;
  experts: string[];
  skills: string[];
  instruction: string;
  todos: ProjectTodo[];
  notes: string[];
};

const PROJECT_WELCOME = `🎉 **欢迎来到 MindBuddy 项目——这里是团队和AI共同协作的工作台**

来带你认识项目空间的核心功能：

📁 **资产与项目配置**：团队资源，全员共用
项目文档、参考资料放进「资产」，团队成员都能看到，我也会自动读取参考。任务产出的文件，也可以直接让我存进资产里——团队随时能查到最新产出。手头好用的专家、Skill、连接器，配置到项目里，团队成员发起任务都能使用。

📋 **计划看板**：分配、管理团队工作
想给团队分工，直接跟我说 "帮我把XX分给A，XX分给B"，我会在「计划」看板里建好待办，谁做什么一目了然。之后有进展、有变化，我能在待办中评论、@对应成员提醒——看板就是团队的工作仪表盘。

🤝 **任务协同**：实时协作，或者接力转交
有任务需要几个人同时对着我讨论、修改，在输入框下方切换到「云端任务」模式，之后在任务对话页右上角发起「协作」，大家就能在同一个对话里一起干活。一件事你开了头、想让别人接手，可以把任务「转交」给同事继续推进，任务进度和当前成果会完整传递。

⚙️ **定时任务**：让重复工作自己跑起来
有些流程需要定期处理——比如每天汇总新闻、定时拉取数据——可以在「定时任务」里配好规则，到时间我会自动执行。执行时，我用的是跟你一样的工具——该读资产就读资产，该建待办就建待办，团队的工作流可以交给我自动处理。

项目已经就位，祝顺利开工 🙂`;

function projectTaskStatus(state: string) {
  if (state === "closed") return "已完成";
  if (state === "running") return "执行中";
  return "待处理";
}

function ProjectTasks({
  matters,
  panel,
  query,
  source,
  onPanel,
  onQuery,
  onSource,
  onOpen,
  onNew,
}: {
  matters: { id: string; title: string; state: string }[];
  panel: "我的任务" | "协同任务";
  query: string;
  source: "全部来源" | "手动创建" | "定时任务";
  onPanel: (value: "我的任务" | "协同任务") => void;
  onQuery: (value: string) => void;
  onSource: (value: "全部来源" | "手动创建" | "定时任务") => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [shared, setShared] = useState<{ id: string; title: string; state: string }[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [leaveFor, setLeaveFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archiveFor, setArchiveFor] = useState<{ id: string; title: string } | null>(null);
  const [deleteOwn, setDeleteOwn] = useState<{ id: string; title: string } | null>(null);
  const renameMatter = useMind((s) => s.renameMatter);
  const archiveMatter = useMind((s) => s.archiveMatter);
  const removeMatter = useMind((s) => s.removeMatter);
  const needle = query.trim();
  const personal = matters.filter((item) => item.state !== "closed");
  const base = panel === "协同任务" ? shared : personal;
  const rows = source === "定时任务" ? [] : base.filter((item) => !needle || item.title.includes(needle));
  return (
    <div className="rounded-xl bg-white p-4 text-sm">
      <div className="mb-3 flex gap-2">
        {(["我的任务", "协同任务"] as const).map((item) => (
          <button key={item} type="button" className={cn("rounded-full px-3 py-1", panel === item && "bg-[#ececee] font-medium")} onClick={() => onPanel(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          aria-label="搜索任务标题"
          placeholder="搜索任务标题"
          className="h-9 w-48 rounded-lg border border-[#e6e6e8] px-3"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <select
          aria-label="全部来源"
          className="h-9 rounded-lg border border-[#e6e6e8] px-2"
          value={source}
          onChange={(event) => onSource(event.target.value as "全部来源" | "手动创建" | "定时任务")}
        >
          <option>全部来源</option>
          <option>手动创建</option>
          <option>定时任务</option>
        </select>
        <span className="text-xs text-[#888]">{`共 ${rows.length} 条`}</span>
        <button type="button" className="ml-auto rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={onNew}>
          新任务
        </button>
      </div>
      {panel === "我的任务" ? <p className="mb-3 text-xs text-[#888]">你的任务是私密的，除非你共享它们</p> : null}
      {rows.length === 0 ? <p className="text-[#888]">没有符合条件的任务</p> : null}
      {panel === "协同任务" ? <p className="mb-3 text-xs text-[#888]">部分会话可能已归档或删除，如未找到请留意</p> : null}
      {notice ? <p className="mb-3 text-xs text-[#666]">{notice}</p> : null}
      <ul className="space-y-2">
        {rows.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#f6f6f7]">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(item.id)}>
              <span className="min-w-0 flex-1 truncate">{item.title || "未命名任务"}</span>
              <span className="text-xs text-[#888]">云端任务</span>
              <span className="text-xs text-[#888]">{panel === "协同任务" ? "协作者" : "手动创建"}</span>
              <span className="text-xs text-[#666]">{projectTaskStatus(item.state)}</span>
            </button>
            <button type="button" className="text-xs text-[#666]" aria-expanded={menuId === item.id} onClick={() => setMenuId(menuId === item.id ? null : item.id)}>
              更多操作
            </button>
            {menuId === item.id && panel === "协同任务" ? (
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => { setLeaveFor(item.title); setMenuId(null); }}>退出协作</button>
                <button type="button" onClick={() => { setNotice("无权删除该任务，仅任务所有者可删除"); setMenuId(null); }}>删除</button>
              </div>
            ) : null}
            {menuId === item.id && panel === "我的任务" ? (
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => { setRenameFor({ id: item.id, title: item.title }); setRenameValue(item.title); setMenuId(null); }}>重命名</button>
                <button type="button" onClick={() => { setArchiveFor({ id: item.id, title: item.title }); setMenuId(null); }}>归档</button>
                <button type="button" onClick={() => { setDeleteOwn({ id: item.id, title: item.title }); setMenuId(null); }}>删除</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {leaveFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="退出协作">
            <p className="font-medium">退出协作</p>
            <p className="mt-2 text-[#666]">{`确定要退出「${leaveFor}」协作吗？退出后该任务将从你的协同任务列表中移除。`}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setLeaveFor(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  const title = leaveFor;
                  setShared((items) => items.filter((item) => item.title !== title));
                  setLeaveFor(null);
                  setNotice(`已退出「${title}」协作`);
                }}
              >
                退出协作
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {renameFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="重命名任务">
            <p className="font-medium">重命名任务</p>
            <p className="mt-2 text-xs text-[#888]">{`原名称：${renameFor.title}`}</p>
            <input aria-label="任务名称" className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setRenameFor(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  const next = renameValue.trim();
                  if (!next) return;
                  renameMatter(renameFor.id, next);
                  setNotice(`已重命名为「${next}」`);
                  setRenameFor(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {archiveFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="归档任务">
            <p className="font-medium">归档任务</p>
            <p className="mt-2 text-[#666]">{`确认将「${archiveFor.title}」归档吗？归档后可在「系统设置 - 数据管理」中查看已归档任务。`}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setArchiveFor(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  archiveMatter(archiveFor.id);
                  setNotice(`已归档「${archiveFor.title}」`);
                  setArchiveFor(null);
                }}
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteOwn ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="删除任务">
            <p className="font-medium">删除任务</p>
            <p className="mt-2 text-[#666]">{`确定要删除「${deleteOwn.title}」吗？任务及其全部产物会被一并删除，且不可恢复。`}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteOwn(null)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  removeMatter(deleteOwn.id);
                  setNotice(`已删除「${deleteOwn.title}」`);
                  setDeleteOwn(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  item,
  depth,
  childrenOf,
  source,
  isSelected,
  onOpen,
  onMenu,
  onToggle,
}: {
  item: ProjectTodo;
  depth: number;
  childrenOf: (id: string) => ProjectTodo[];
  source: string;
  isSelected: (id: string) => boolean;
  onOpen: (id: string) => void;
  onMenu: (id: string, event: { preventDefault: () => void; clientX: number; clientY: number }) => void;
  onToggle: (id: string) => void;
}) {
  const nested = childrenOf(item.id);
  const handoff = item.id.startsWith("handoff-");
  const selected = isSelected(item.id);
  return (
    <li>
      <div className="flex items-start gap-1" style={{ marginLeft: depth * 12 }}>
        {handoff ? null : <input type="checkbox" className="mt-3" aria-label={item.title} checked={selected} onChange={() => onToggle(item.id)} />}
        <button
          type="button"
          className={cn("w-full rounded-lg border border-[#ececee] px-2 py-2 text-left text-sm", selected && "ring-1 ring-[#1a1a1a]")}
          onClick={() => onOpen(item.id)}
          onContextMenu={(event) => onMenu(item.id, event)}
        >
          <span className="block">{item.title}</span>
          {source ? <span className="mt-1 block text-xs text-[#888]">{`来自「${source}」`}</span> : null}
        </button>
      </div>
      {nested.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {nested.map((child) => (
            <PlanCard key={child.id} item={child} depth={depth + 1} childrenOf={childrenOf} source="" isSelected={isSelected} onOpen={onOpen} onMenu={onMenu} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ProjectsPage() {
  const catalog = useMind((s) => s.catalog);
  const matters = useMind((s) => s.matters);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("项目交付");
  const [draftInstruction, setDraftInstruction] = useState("管理客户需求、计划、风险和周报");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<"专家" | "技能" | "指令">("专家");
  const [configOpen, setConfigOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"动态" | "资产" | "计划" | "任务">("动态");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [joinMode, setJoinMode] = useState<"申请后加入" | "直接加入">("申请后加入");
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState([{ name: "经办人", role: "所有者" }, { name: "合规", role: "成员" }]);
  const [joinRequest, setJoinRequest] = useState<"待处理" | "已同意" | "已拒绝">("待处理");
  const [removeName, setRemoveName] = useState<string | null>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const [todoTitle, setTodoTitle] = useState("");
  const [selectedTodo, setSelectedTodo] = useState<string | null>(null);
  const [planMenu, setPlanMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [insertCount, setInsertCount] = useState("1");
  const [subCount, setSubCount] = useState("1");
  const [planClip, setPlanClip] = useState<ProjectTodo | null>(null);
  const [deleteTodoId, setDeleteTodoId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [detailWide, setDetailWide] = useState(false);
  const [completeAsk, setCompleteAsk] = useState<{ id: string; count: number } | null>(null);
  const [planComments, setPlanComments] = useState<PlanComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const [commentSending, setCommentSending] = useState(false);
  const [commentMenu, setCommentMenu] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [batchDelete, setBatchDelete] = useState(false);
  const [planFilter, setPlanFilter] = useState<"全部状态" | PlanStatus>("全部状态");
  const [ownerFilter, setOwnerFilter] = useState("全部处理人");
  const [scopeFilter, setScopeFilter] = useState<"全部归属" | "指派给我" | "我创建的">("全部归属");
  const [sourceFilter, setSourceFilter] = useState<"全部来源" | "手动创建" | "转交">("全部来源");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterPinned, setFilterPinned] = useState(false);
  const [planConditions, setPlanConditions] = useState<PlanCondition[]>([]);
  const [planConj, setPlanConj] = useState<"全部条件" | "任一条件">("全部条件");
  const [planBuilderOpen, setPlanBuilderOpen] = useState(false);
  const [planPicker, setPlanPicker] = useState<{ id: string; kind: "field" | "op" | "value" } | null>(null);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [planMode, setPlanMode] = useState<"看板" | "列表" | "表格" | "甘特" | "日历">("看板");
  const [planGroup, setPlanGroup] = useState<"状态" | "处理人" | "不分组">("状态");
  const [planOrder, setPlanOrder] = useState<"不排序" | "优先级" | "更新时间" | "创建时间">("不排序");
  const [planOrderDir, setPlanOrderDir] = useState<"升序" | "降序">("升序");
  const [shownFields, setShownFields] = useState<string[]>(["状态", "处理人", "来源", "优先级", "截止日期", "更新时间"]);
  const [showSubTodos, setShowSubTodos] = useState(true);
  const [groupsFolded, setGroupsFolded] = useState(false);
  const [columnMenu, setColumnMenu] = useState<{ field: string; x: number; y: number } | null>(null);
  const [frozenThrough, setFrozenThrough] = useState<string | null>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const titleAtFocus = useRef("");
  const [savedViews, setSavedViews] = useState<PlanView[]>([]);
  const [activeView, setActiveView] = useState("all");
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewMenu, setViewMenu] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const role = useMind((s) => s.role);
  useEffect(() => {
    setReplyTo(null);
    setEditingComment(null);
    setCommentDraft("");
    setCommentMenu(null);
    setDescEditing(false);
    setDescDraft("");
    setDescSaving(false);
  }, [selectedTodo]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [taskPanel, setTaskPanel] = useState<"我的任务" | "协同任务">("我的任务");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskSource, setTaskSource] = useState<"全部来源" | "手动创建" | "定时任务">("全部来源");
  const [chat, setChat] = useState("");
  const handoffs = useSyncExternalStore(subscribeHandoffs, getHandoffs);
  const navigate = useNavigate();
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const visible = projects
    .filter((item) => item.name.includes(query.trim()))
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const templateDesc = PROJECT_TEMPLATES.find((item) => item.title === template)?.desc ?? "";
  const current = projects.find((item) => item.name === active);
  const boardTodos: ProjectTodo[] = current
    ? [
        ...handoffs.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          priority: "未设置" as const,
          owner: item.owner,
          description: item.description,
          due: "",
          tags: "",
        })),
        ...current.todos,
      ]
    : [];
  const pickedTodo = boardTodos.find((item) => item.id === selectedTodo) ?? null;
  const planOwners = [...new Set(boardTodos.map((item) => item.owner).filter(Boolean))];
  function matchesPlan(item: ProjectTodo) {
    if (planFilter !== "全部状态" && item.status !== planFilter) return false;
    if (ownerFilter !== "全部处理人" && item.owner !== ownerFilter) return false;
    const handedOff = item.id.startsWith("handoff-");
    if (scopeFilter === "指派给我" && item.owner !== role) return false;
    if (scopeFilter === "我创建的" && handedOff) return false;
    if (sourceFilter === "手动创建" && handedOff) return false;
    if (sourceFilter === "转交" && !handedOff) return false;
    const ready = planConditions.filter((condition) => condition.field && condition.op);
    if (ready.length === 0) return true;
    const hits = ready.map((condition) => planConditionHit(item, condition, role));
    return planConj === "任一条件" ? hits.some(Boolean) : hits.every(Boolean);
  }
  const visiblePlan = boardTodos.filter((item) => matchesPlan(item) && (showSubTodos || !item.parentId)).slice().sort((a, b) => {
    if (planOrder !== "优先级") return 0;
    const diff = PLAN_PRIORITIES.indexOf(a.priority) - PLAN_PRIORITIES.indexOf(b.priority);
    return planOrderDir === "降序" ? -diff : diff;
  });
  const tableFields = ["标题", ...(["状态", "处理人", "来源", "优先级", "截止日期", "更新时间"] as const).filter((field) => shownFields.includes(field))];
  function columnFrozen(field: string) {
    if (!frozenThrough) return false;
    const end = tableFields.indexOf(frozenThrough);
    const at = tableFields.indexOf(field);
    return end >= 0 && at >= 0 && at <= end;
  }
  function columnFreezeLeft(field: string) {
    const at = tableFields.indexOf(field);
    let left = 0;
    for (let index = 0; index < at; index += 1) if (columnFrozen(tableFields[index])) left += 96;
    return left;
  }
  const planColumns = planGroup === "不分组"
    ? [{ key: "全部", items: visiblePlan }]
    : planGroup === "处理人"
      ? [...new Set(visiblePlan.map((item) => item.owner || "未指派"))].map((key) => ({ key, items: visiblePlan.filter((item) => (item.owner || "未指派") === key) }))
      : PLAN_STATUSES.map((key) => ({ key, items: visiblePlan.filter((item) => item.status === key) }));
  function snapshotPlan(name: string, id: string): PlanView {
    return { id, name, mode: planMode, group: planGroup, order: planOrder, dir: planOrderDir, status: planFilter, owner: ownerFilter, scope: scopeFilter, source: sourceFilter, conditions: planConditions, conj: planConj, fields: shownFields };
  }
  function applyPlanView(view: PlanView) {
    setPlanMode(view.mode);
    setPlanGroup(view.group);
    setPlanOrder(view.order);
    setPlanOrderDir(view.dir);
    setPlanFilter(view.status);
    setOwnerFilter(view.owner);
    setScopeFilter(view.scope);
    setSourceFilter(view.source);
    setPlanConditions(view.conditions);
    setPlanConj(view.conj);
    setShownFields(view.fields);
    setActiveView(view.id);
  }
  function resetPlanView() {
    setPlanMode("看板");
    setPlanGroup("状态");
    setPlanOrder("不排序");
    setPlanOrderDir("升序");
    setPlanFilter("全部状态");
    setOwnerFilter("全部处理人");
    setScopeFilter("全部归属");
    setSourceFilter("全部来源");
    setPlanConditions([]);
    setPlanConj("全部条件");
    setShownFields(["状态", "处理人", "来源", "优先级", "截止日期", "更新时间"]);
    setShowSubTodos(true);
    setGroupsFolded(false);
    setFrozenThrough(null);
    setColumnMenu(null);
    setActiveView("all");
  }
  function createPlanView(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setToast("创建视图失败，请重试");
      return;
    }
    const view = snapshotPlan(trimmed, `view-${Date.now()}`);
    setSavedViews((items) => [...items, view]);
    setActiveView(view.id);
    setViewName("");
    setToast(`新视图「${trimmed}」已创建`);
  }
  function saveActiveView() {
    const currentView = savedViews.find((view) => view.id === activeView);
    if (!currentView) {
      setToast("保存视图配置失败，请重试");
      return;
    }
    setSavedViews((items) => items.map((view) => (view.id === currentView.id ? snapshotPlan(view.name, view.id) : view)));
    setToast("视图配置已保存");
  }
  function duplicateActiveView() {
    const currentView = savedViews.find((view) => view.id === (viewMenu ?? activeView));
    if (!currentView) {
      setToast("创建视图失败，请重试");
      return;
    }
    createPlanView("新视图");
  }
  function resetActiveView() {
    const currentView = savedViews.find((view) => view.id === (viewMenu ?? activeView));
    if (!currentView) {
      resetPlanView();
      return;
    }
    applyPlanView(currentView);
  }
  function renameActiveView() {
    const currentView = savedViews.find((view) => view.id === (viewMenu ?? activeView));
    const trimmed = viewName.trim();
    if (!currentView || !trimmed) {
      setToast("重命名视图失败，请重试");
      return;
    }
    setSavedViews((items) => items.map((view) => (view.id === currentView.id ? { ...view, name: trimmed } : view)));
    setViewName("");
    setToast("视图已重命名");
  }
  function deleteActiveView() {
    const id = viewMenu ?? activeView;
    if (!savedViews.some((view) => view.id === id)) {
      setToast("删除视图失败，请重试");
      return;
    }
    setSavedViews((items) => items.filter((view) => view.id !== id));
    if (activeView === id) resetPlanView();
    setViewMenu(null);
    setToast("视图已删除");
  }
  function mutateTodos(recipe: (todos: ProjectTodo[]) => ProjectTodo[]) {
    if (!current) return;
    setProjects((items) => items.map((item) => (item.name === current.name ? { ...item, todos: recipe(item.todos) } : item)));
  }
  function blankTodo(status: PlanStatus, parentId?: string, index = 0): ProjectTodo {
    return {
      id: `todo-${Date.now()}-${index}`,
      title: "未命名待办",
      status,
      priority: "未设置",
      owner: "未设置",
      description: "",
      due: "",
      tags: "",
      parentId,
    };
  }
  function todoCount(raw: string) {
    const count = Number(raw);
    if (!Number.isFinite(count) || count < 1) return 1;
    return Math.min(20, Math.floor(count));
  }
  function insertRelative(id: string, where: "above" | "below", raw: string) {
    if (!current || id.startsWith("handoff-")) return;
    const anchor = current.todos.find((todo) => todo.id === id);
    if (!anchor) return;
    const fresh = Array.from({ length: todoCount(raw) }, (_, index) => blankTodo(anchor.status, anchor.parentId, index));
    mutateTodos((todos) => {
      const index = todos.findIndex((todo) => todo.id === id);
      if (index < 0) return todos;
      const at = where === "above" ? index : index + 1;
      return [...todos.slice(0, at), ...fresh, ...todos.slice(at)];
    });
    setPlanMenu(null);
  }
  function addSubtodos(id: string, raw: string) {
    if (!current || id.startsWith("handoff-")) return;
    const anchor = current.todos.find((todo) => todo.id === id);
    if (!anchor) return;
    const fresh = Array.from({ length: todoCount(raw) }, (_, index) => blankTodo(anchor.status, id, index + 1));
    mutateTodos((todos) => {
      const index = todos.findIndex((todo) => todo.id === id);
      if (index < 0) return todos;
      return [...todos.slice(0, index + 1), ...fresh, ...todos.slice(index + 1)];
    });
    setPlanMenu(null);
  }
  function duplicateTodo(id: string) {
    if (!current || id.startsWith("handoff-")) return;
    mutateTodos((todos) => {
      const index = todos.findIndex((todo) => todo.id === id);
      const anchor = todos[index];
      if (!anchor) return todos;
      return [...todos.slice(0, index + 1), { ...anchor, id: `todo-${Date.now()}-copy` }, ...todos.slice(index + 1)];
    });
    setPlanMenu(null);
  }
  function pasteTodo(id: string) {
    if (!current || !planClip || id.startsWith("handoff-")) return;
    mutateTodos((todos) => {
      const index = todos.findIndex((todo) => todo.id === id);
      const at = index < 0 ? todos.length : index + 1;
      const copy = { ...planClip, id: `todo-${Date.now()}-paste`, parentId: todos[index]?.parentId };
      return [...todos.slice(0, at), copy, ...todos.slice(at)];
    });
    setPlanMenu(null);
  }
  function directChildren(id: string) {
    return current?.todos.filter((todo) => todo.parentId === id) ?? [];
  }
  function removeTodo(id: string, mode: "self" | "cascade") {
    mutateTodos((todos) => {
      if (mode === "cascade") {
        const drop = new Set([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const todo of todos) {
            if (todo.parentId && drop.has(todo.parentId) && !drop.has(todo.id)) {
              drop.add(todo.id);
              grew = true;
            }
          }
        }
        return todos.filter((todo) => !drop.has(todo.id));
      }
      const self = todos.find((todo) => todo.id === id);
      return todos
        .filter((todo) => todo.id !== id)
        .map((todo) => (todo.parentId === id ? { ...todo, parentId: self?.parentId } : todo));
    });
    if (selectedTodo === id) setSelectedTodo(null);
    setDeleteTodoId(null);
    setPlanMenu(null);
  }
  function createInColumn(key: string) {
    if (!current) return;
    const status = planGroup === "状态" && (PLAN_STATUSES as readonly string[]).includes(key) ? (key as PlanStatus) : "待开始";
    const owner = planGroup === "处理人" && key !== "未指派" ? key : "未设置";
    mutateTodos((todos) => [...todos, { ...blankTodo(status), owner }]);
  }
  function togglePicked(id: string) {
    setPickedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }
  function toggleColumn(items: ProjectTodo[]) {
    const ids = items.filter((item) => !item.id.startsWith("handoff-")).map((item) => item.id);
    if (ids.length === 0) return;
    const allOn = ids.every((id) => pickedIds.includes(id));
    setPickedIds((currentIds) => (allOn ? currentIds.filter((id) => !ids.includes(id)) : [...new Set([...currentIds, ...ids])]));
  }
  function openPlanMenu(id: string, event: { preventDefault: () => void; clientX: number; clientY: number }) {
    event.preventDefault();
    setInsertCount("1");
    setSubCount("1");
    setPlanMenu({ id, x: Math.min(event.clientX, window.innerWidth - 240), y: Math.min(event.clientY, window.innerHeight - 320) });
  }
  function patchTodo(id: string, patch: Partial<ProjectTodo>) {
    if (id.startsWith("handoff-")) {
      updateHandoff(id, {
        title: patch.title,
        description: patch.description,
        owner: patch.owner,
        status: patch.status,
      });
      return;
    }
    if (!current) return;
    setProjects((items) =>
      items.map((item) =>
        item.name === current.name ? { ...item, todos: item.todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)) } : item,
      ),
    );
  }
  if (current) {
    return (
      <Page title={current.name} subtitle="项目">
        <div className="mb-4 flex items-center gap-2">
          <button type="button" className="text-sm text-[#666]" onClick={() => setActive(null)}>
            项目
          </button>
          <button type="button" className="ml-auto rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" aria-expanded={membersOpen} onClick={() => setMembersOpen((open) => !open)}>
            {`项目团队成员 · ${members.length}`}
          </button>
          <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" onClick={() => { setInviteOpen(true); setInviteCopied(false); }}>
            邀请
          </button>
          <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" onClick={() => setConfigOpen((open) => !open)}>
            {configOpen ? "收起项目配置" : "展开项目配置"}
          </button>
        </div>
        {membersOpen ? (
          <ul className="mb-4 max-w-md rounded-xl bg-white p-3 text-sm">
            {members.map((member) => (
              <li key={member.name} className="flex items-center gap-2 py-1">
                <span>{member.name}</span>
                <span className="text-xs text-[#888]">{member.role}</span>
                {member.role === "所有者" ? null : (
                  <button type="button" className="ml-auto text-[#666]" onClick={() => setRemoveName(member.name)}>
                    移除成员
                  </button>
                )}
              </li>
            ))}
            {joinMode === "申请后加入" ? (
              <li className="flex items-center gap-2 border-t border-[#ececee] py-2">
                <span>财务</span>
                <span className="text-xs text-[#888]">申请权限：成员</span>
                {joinRequest === "待处理" ? (
                  <>
                    <button type="button" className="ml-auto text-[#666]" onClick={() => { setJoinRequest("已同意"); setMembers((items) => items.some((item) => item.name === "财务") ? items : [...items, { name: "财务", role: "成员" }]); setToast("已同意"); }}>同意</button>
                    <button type="button" className="text-[#666]" onClick={() => { setJoinRequest("已拒绝"); setToast("已拒绝"); }}>拒绝</button>
                  </>
                ) : (
                  <span className="ml-auto text-xs text-[#888]">{joinRequest}</span>
                )}
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="flex min-h-[520px] gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex gap-2 text-sm">
              {(["动态", "资产", "计划", "任务"] as const).map((item) => (
                <button key={item} className={cn("rounded-full px-3 py-1", detailTab === item && "bg-[#ececee] font-medium")} onClick={() => setDetailTab(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {detailTab === "动态" ? (
                <div className="max-w-2xl space-y-3">
                  <p className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-[#333]">{PROJECT_WELCOME}</p>
                  {current.notes.map((note) => (
                    <p key={note} className="rounded-xl bg-white px-4 py-3 text-sm">我：{note}</p>
                  ))}
                </div>
              ) : null}
              {detailTab === "资产" ? (
                <div className="rounded-xl bg-white p-6">
                  <p className="text-sm font-medium">项目资料库</p>
                  <p className="mt-2 text-sm text-[#888]">暂无内容</p>
                </div>
              ) : null}
              {detailTab === "计划" ? (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="relative">
                      <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
                        筛选
                      </button>
                      {filterOpen ? (
                        <div className="absolute left-0 top-10 z-10 max-h-[28rem] w-80 overflow-auto rounded-xl border border-[#ececee] bg-white p-2 shadow">
                          <input
                            aria-label="搜索"
                            placeholder="搜索..."
                            value={filterQuery}
                            className="mb-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2 text-sm"
                            onChange={(event) => setFilterQuery(event.target.value)}
                          />
                          {(() => {
                            const needle = filterQuery.trim();
                            const show = (label: string) => !needle || label.includes(needle);
                            const statuses = (["全部状态", ...PLAN_STATUSES] as const).filter(show);
                            const owners = ["全部处理人", ...planOwners].filter(show);
                            const scopes = (["全部归属", "指派给我", "我创建的"] as const).filter(show);
                            const sources = (["全部来源", "手动创建", "转交"] as const).filter(show);
                            if (statuses.length + owners.length + scopes.length + sources.length === 0) {
                              return <p className="px-2 py-2 text-xs text-[#888]">暂无可选项</p>;
                            }
                            return (
                              <>
                          {statuses.length > 0 ? <p className="px-2 py-1 text-xs text-[#888]">状态</p> : null}
                          {statuses.map((status) => (
                            <button
                              key={status}
                              type="button"
                              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]"
                              onClick={() => {
                                setPlanFilter(status);
                                setFilterOpen(false);
                              }}
                            >
                              {status}
                            </button>
                          ))}
                          {owners.length > 0 ? <p className="mt-1 px-2 py-1 text-xs text-[#888]">处理人</p> : null}
                          {owners.map((owner) => (
                            <button
                              key={owner}
                              type="button"
                              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]"
                              onClick={() => {
                                setOwnerFilter(owner);
                                setFilterOpen(false);
                              }}
                            >
                              {owner}
                            </button>
                          ))}
                          {scopes.length > 0 ? <p className="mt-1 px-2 py-1 text-xs text-[#888]">范围</p> : null}
                          {scopes.map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]"
                              onClick={() => {
                                setScopeFilter(scope);
                                setFilterOpen(false);
                              }}
                            >
                              {scope}
                            </button>
                          ))}
                          {sources.length > 0 ? <p className="mt-1 px-2 py-1 text-xs text-[#888]">来源</p> : null}
                          {sources.map((source) => (
                            <button
                              key={source}
                              type="button"
                              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]"
                              onClick={() => {
                                setSourceFilter(source);
                                setFilterOpen(false);
                              }}
                            >
                              {source}
                            </button>
                          ))}
                              </>
                            );
                          })()}
                          <button type="button" className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={() => setFilterPinned(true)}>
                            固定到工具栏
                          </button>
                          <div className="mt-2 border-t border-[#ececee] pt-2">
                            {planBuilderOpen && planConditions.length > 0 ? (
                              <>
                                <label className="mb-2 flex items-center gap-2 px-2 text-xs text-[#666]">
                                  满足以下
                                  <select aria-label="条件连接方式" className="h-7 rounded-lg border border-[#e6e6e8] px-1" value={planConj} onChange={(event) => setPlanConj(event.target.value as "全部条件" | "任一条件")}>
                                    <option>全部条件</option>
                                    <option>任一条件</option>
                                  </select>
                                </label>
                                {planConditions.map((condition) => {
                                  const choices = condition.field === "状态" ? [...PLAN_STATUSES] : condition.field === "来源" ? ["手动创建", "转交"] : condition.field === "范围" ? ["指派给我", "我创建的"] : condition.field === "优先级" ? [...PLAN_PRIORITIES] : condition.field === "处理人" ? ["未设置", ...planOwners] : [];
                                  const members = choices.filter((item) => item.includes(memberQuery.trim()));
                                  const needsValue = condition.op !== "为空" && condition.op !== "不为空";
                                  return (
                                    <div key={condition.id} className="mb-2 rounded-lg bg-[#f7f7f8] p-2">
                                      <button type="button" aria-label="切换字段" className="rounded-lg bg-white px-2 py-1 text-sm" onClick={() => setPlanPicker(planPicker?.id === condition.id && planPicker.kind === "field" ? null : { id: condition.id, kind: "field" })}>
                                        {condition.field || "请选择"}
                                      </button>
                                      {planPicker?.id === condition.id && planPicker.kind === "field" ? (
                                        <div className="mt-1">
                                          {PLAN_FIELDS.map((field) => (
                                            <button key={field} type="button" className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-white" onClick={() => { setPlanConditions((rows) => rows.map((row) => row.id === condition.id ? { ...row, field, value: "" } : row)); setPlanPicker(null); }}>
                                              {field}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      <button type="button" aria-label="切换运算符" className="ml-1 rounded-lg bg-white px-2 py-1 text-sm" onClick={() => setPlanPicker(planPicker?.id === condition.id && planPicker.kind === "op" ? null : { id: condition.id, kind: "op" })}>
                                        {condition.op || "请选择"}
                                      </button>
                                      {planPicker?.id === condition.id && planPicker.kind === "op" ? (
                                        <div className="mt-1">
                                          {PLAN_OPS.map((op) => (
                                            <button key={op} type="button" className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-white" onClick={() => { setPlanConditions((rows) => rows.map((row) => row.id === condition.id ? { ...row, op } : row)); setPlanPicker(null); }}>
                                              {op}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      {needsValue && condition.field === "处理人" ? (
                                        <div className="mt-1">
                                          <input aria-label="搜索成员" placeholder="搜索成员" className="h-8 w-full rounded-lg border border-[#e6e6e8] px-2 text-sm" value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setPlanPicker({ id: condition.id, kind: "value" }); }} />
                                          {members.length === 0 ? <p className="px-2 py-1 text-xs text-[#888]">无相关结果</p> : members.map((member) => (
                                            <button key={member} type="button" className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-white" onClick={() => { setPlanConditions((rows) => rows.map((row) => row.id === condition.id ? { ...row, value: member } : row)); setMemberQuery(""); }}>
                                              {member}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      {needsValue && condition.field !== "处理人" && choices.length > 0 ? (
                                        <select aria-label="请选择" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2 text-sm" value={condition.value} onChange={(event) => setPlanConditions((rows) => rows.map((row) => row.id === condition.id ? { ...row, value: event.target.value } : row))}>
                                          <option value="">请选择</option>
                                          {choices.map((choice) => <option key={choice}>{choice}</option>)}
                                        </select>
                                      ) : null}
                                      {needsValue && choices.length === 0 && condition.field && condition.field !== "处理人" ? (
                                        <input aria-label="请输入" placeholder="请输入" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2 text-sm" value={condition.value} onChange={(event) => setPlanConditions((rows) => rows.map((row) => row.id === condition.id ? { ...row, value: event.target.value } : row))} />
                                      ) : null}
                                      <button type="button" className="mt-1 block text-xs text-[#666]" onClick={() => setPlanConditions((rows) => rows.filter((row) => row.id !== condition.id))}>
                                        删除条件
                                      </button>
                                    </div>
                                  );
                                })}
                                <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={() => setPlanBuilderOpen(false)}>
                                  收起
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]"
                              onClick={() => {
                                setPlanBuilderOpen(true);
                                setPlanConditions((rows) => [...rows, { id: `cond-${Date.now()}`, field: "", op: "", value: "" }]);
                              }}
                            >
                              添加筛选条件
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <span className="text-xs text-[#888]">{boardTodos.filter(matchesPlan).length} 个待办</span>
                    {filterPinned ? (
                      <button type="button" className="text-xs text-[#666]" onClick={() => setFilterPinned(false)}>
                        取消固定
                      </button>
                    ) : null}
                    <div className="relative ml-auto">
                      <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" aria-expanded={viewsOpen} onClick={() => setViewsOpen((open) => !open)}>
                        视图
                      </button>
                      {viewsOpen ? (
                        <div className="absolute right-0 top-10 z-10 w-64 rounded-xl border border-[#ececee] bg-white p-3 shadow">
                          <p className="text-sm font-medium">视图</p>
                          <button type="button" className="mt-2 block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={resetPlanView}>全部</button>
                          <p className="mt-2 px-2 text-xs text-[#888]">全部视图</p>
                          {savedViews.map((view) => (
                            <div key={view.id} className="flex items-center">
                              <button type="button" className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#f6f6f7]" onClick={() => applyPlanView(view)}>{view.name}</button>
                              <button type="button" aria-label="更多操作" className="px-2 text-sm" onClick={() => setViewMenu(viewMenu === view.id ? null : view.id)}>···</button>
                            </div>
                          ))}
                          {viewMenu ? (
                            <div className="mt-1 rounded-lg bg-[#f7f7f8] p-2">
                              <button type="button" className="block w-full px-2 py-1 text-left text-sm" onClick={() => saveActiveView()}>保存视图</button>
                              <button type="button" className="block w-full px-2 py-1 text-left text-sm" onClick={() => duplicateActiveView()}>创建副本</button>
                              <button type="button" className="block w-full px-2 py-1 text-left text-sm" onClick={() => resetActiveView()}>重置</button>
                              <button type="button" className="block w-full px-2 py-1 text-left text-sm" onClick={() => renameActiveView()}>重命名</button>
                              <button type="button" className="block w-full px-2 py-1 text-left text-sm" onClick={() => deleteActiveView()}>删除</button>
                            </div>
                          ) : null}
                          <label className="mt-3 block text-sm">
                            新建视图
                            <input aria-label="输入视图名称" placeholder="输入视图名称" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={viewName} onChange={(event) => setViewName(event.target.value)} />
                          </label>
                          <button type="button" className="mt-2 w-full rounded-lg bg-[#1a1a1a] px-2 py-1.5 text-sm text-white" onClick={() => createPlanView(viewName)}>保存为新视图</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="relative">
                      <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm" aria-expanded={displayOpen} onClick={() => setDisplayOpen((open) => !open)}>
                        看板设置
                      </button>
                      {displayOpen ? (
                        <div className="absolute right-0 top-10 z-10 w-64 rounded-xl border border-[#ececee] bg-white p-3 shadow">
                          <p className="text-sm font-medium">配置</p>
                          <div className="mt-2 flex flex-wrap gap-1" aria-label="视图模式">
                            {(["看板", "列表", "表格", "甘特", "日历"] as const).map((mode) => (
                              <button key={mode} type="button" className={cn("rounded-full px-2 py-1 text-sm", planMode === mode && "bg-[#ececee] font-medium")} onClick={() => setPlanMode(mode)}>
                                {mode}
                              </button>
                            ))}
                          </div>
                          <label className="mt-3 block text-sm">
                            分组
                            <select aria-label="分组" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={planGroup} onChange={(event) => setPlanGroup(event.target.value as "状态" | "处理人" | "不分组")}>
                              <option>状态</option>
                              <option>处理人</option>
                              <option>不分组</option>
                            </select>
                          </label>
                          <label className="mt-3 block text-sm">
                            排序
                            <select aria-label="排序" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={planOrder} onChange={(event) => setPlanOrder(event.target.value as "不排序" | "优先级" | "更新时间" | "创建时间")}>
                              <option>不排序</option>
                              <option>优先级</option>
                              <option>更新时间</option>
                              <option>创建时间</option>
                            </select>
                          </label>
                          <div className="mt-2 flex gap-1">
                            {(["升序", "降序"] as const).map((dir) => (
                              <button key={dir} type="button" className={cn("rounded-full px-2 py-1 text-sm", planOrderDir === dir && "bg-[#ececee] font-medium")} onClick={() => setPlanOrderDir(dir)}>
                                {dir}
                              </button>
                            ))}
                          </div>
                          <label className="mt-3 flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showSubTodos} onChange={(event) => setShowSubTodos(event.target.checked)} />
                            显示子待办
                          </label>
                          <p className="mt-3 text-sm">字段显示</p>
                          {(["状态", "处理人", "来源", "优先级", "截止日期", "更新时间"] as const).map((field) => (
                            <label key={field} className="mt-1 flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={shownFields.includes(field)}
                                onChange={(event) => setShownFields((items) => event.target.checked ? [...items, field] : items.filter((item) => item !== field))}
                              />
                              {field}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => setTodoOpen(true)}>
                      创建
                    </button>
                  </div>
                  {boardTodos.length === 0 ? <p className="text-sm text-[#888]">暂无事项，可从这里开始新建。</p> : null}
                  {boardTodos.length > 0 && boardTodos.every((item) => !matchesPlan(item)) ? (
                    <p className="mb-3 text-sm text-[#888]">当前筛选下暂无事项</p>
                  ) : null}
                  {planMode === "列表" ? <p className="mb-3 text-sm text-[#888]">列表展示尚在规划中，当前仍以看板呈现。</p> : null}
                  {pickedIds.length > 0 ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                      <span>{`选中 ${pickedIds.length} 项`}</span>
                      <button type="button" className="rounded-lg border border-[#e6e6e8] px-2 py-1" onClick={() => setPickedIds([])}>取消选择</button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#e6e6e8] px-2 py-1"
                        onClick={() => {
                          const titles = boardTodos.filter((item) => pickedIds.includes(item.id)).map((item) => item.title);
                          setChat(chat.trim() ? `${chat.trim()}\n${titles.join("\n")}` : titles.join("\n"));
                          setToast(`已添加 ${titles.length} 个事项到对话`);
                        }}
                      >
                        添加到对话
                      </button>
                      <button type="button" className="rounded-lg px-2 py-1 text-[#c04545]" onClick={() => setBatchDelete(true)}>删除</button>
                      <button type="button" className="ml-auto rounded-lg px-2 py-1 text-[#666]" onClick={() => setPickedIds([])}>关闭</button>
                    </div>
                  ) : null}
                  {planMode === "看板" || planMode === "列表" ? (
                  <div>
                  <div className="mb-2 flex gap-2">
                    <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-2 py-1 text-xs" aria-pressed={groupsFolded} onClick={() => setGroupsFolded(true)}>折叠所有分组</button>
                    <button type="button" className="rounded-lg border border-[#e6e6e8] bg-white px-2 py-1 text-xs" aria-pressed={!groupsFolded} onClick={() => setGroupsFolded(false)}>展开所有分组</button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {planColumns.map((column) => {
                      const selectable = column.items.filter((item) => !item.id.startsWith("handoff-"));
                      const allOn = selectable.length > 0 && selectable.every((item) => pickedIds.includes(item.id));
                      return (
                      <section key={column.key} className="rounded-xl bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div>
                            <p className="text-xs font-medium text-[#666]">{column.key}</p>
                            {PLAN_STATUS_DESC[column.key as PlanStatus] ? <p className="mt-1 text-xs text-[#999]">{PLAN_STATUS_DESC[column.key as PlanStatus]}</p> : null}
                          </div>
                          <button type="button" className="text-xs text-[#666]" onClick={() => createInColumn(column.key)}>新建待办</button>
                          {selectable.length > 0 ? (
                            <button type="button" className="text-xs text-[#666]" onClick={() => toggleColumn(column.items)}>{allOn ? "取消全选" : "全选"}</button>
                          ) : null}
                        </div>
                        {groupsFolded ? null : (
                        <ul className="mt-2 space-y-2">
                          {column.items
                            .filter((item) => !item.parentId || !column.items.some((other) => other.id === item.parentId))
                            .map((item) => (
                            <PlanCard
                              key={item.id}
                              item={item}
                              depth={0}
                              childrenOf={(id) => column.items.filter((child) => child.parentId === id)}
                              source={item.id.startsWith("handoff-") ? handoffs.find((handoff) => handoff.id === item.id)?.source ?? "当前任务" : ""}
                              isSelected={(id) => pickedIds.includes(id)}
                              onOpen={setSelectedTodo}
                              onMenu={openPlanMenu}
                              onToggle={togglePicked}
                            />
                          ))}
                        </ul>
                        )}
                      </section>
                      );
                    })}
                  </div>
                  </div>
                  ) : null}
                  {planMode === "表格" ? (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs text-[#888]">
                          {tableFields.map((field) => (
                            <th
                              key={field}
                              className={cn("py-2", columnFrozen(field) && "sticky z-10 bg-white")}
                              style={columnFrozen(field) ? { left: columnFreezeLeft(field) } : undefined}
                              data-frozen={columnFrozen(field) ? "true" : undefined}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setColumnMenu({ field, x: event.clientX, y: event.clientY });
                              }}
                            >
                              {field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePlan.map((item) => (
                          <tr key={item.id}>
                            {tableFields.map((field) => (
                              <td key={field} className={cn("py-2", columnFrozen(field) && "sticky z-10 bg-white")} style={columnFrozen(field) ? { left: columnFreezeLeft(field) } : undefined}>
                                {field === "标题" ? <button type="button" onClick={() => setSelectedTodo(item.id)}>{item.title}</button> : field === "状态" ? item.status : field === "处理人" ? item.owner || "未设置" : field === "来源" ? (item.id.startsWith("handoff-") ? "转交" : "手动创建") : field === "优先级" ? item.priority : field === "截止日期" ? item.due || "未设置" : "刚刚"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {columnMenu ? (
                    <div className="fixed inset-0 z-30" onClick={() => setColumnMenu(null)}>
                      <div role="menu" aria-label="表格右键菜单" className="absolute w-44 rounded-xl border border-[#ececee] bg-white p-1 text-sm shadow-lg" style={{ left: columnMenu.x, top: columnMenu.y }} onClick={(event) => event.stopPropagation()}>
                        {columnMenu.field === "状态" || columnMenu.field === "处理人" ? (
                          <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setPlanGroup(columnMenu.field as "状态" | "处理人"); setColumnMenu(null); }}>按此列分组</button>
                        ) : null}
                        <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setPlanGroup("不分组"); setColumnMenu(null); }}>取消分组</button>
                        {columnMenu.field === "优先级" || columnMenu.field === "更新时间" ? (
                          <>
                            <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setPlanOrder(columnMenu.field as "优先级" | "更新时间"); setPlanOrderDir("升序"); setColumnMenu(null); }}>升序</button>
                            <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setPlanOrder(columnMenu.field as "优先级" | "更新时间"); setPlanOrderDir("降序"); setColumnMenu(null); }}>降序</button>
                            {planOrder === columnMenu.field ? <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setPlanOrder("不排序"); setColumnMenu(null); }}>取消排序</button> : null}
                          </>
                        ) : null}
                        <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => {
                          if (columnMenu.field === "标题") {
                            setToast("标题列不能隐藏");
                          } else {
                            setShownFields((items) => items.filter((item) => item !== columnMenu.field));
                            if (frozenThrough === columnMenu.field) setFrozenThrough(null);
                            setToast("隐藏成功");
                          }
                          setColumnMenu(null);
                        }}>隐藏字段</button>
                        <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setFrozenThrough(frozenThrough === columnMenu.field ? null : columnMenu.field); setColumnMenu(null); }}>{frozenThrough === columnMenu.field ? "取消冻结到此列" : "冻结至此列"}</button>
                      </div>
                    </div>
                  ) : null}
                  {planMode === "甘特" ? (
                    <ul className="space-y-2">
                      {visiblePlan.map((item) => (
                        <li key={item.id}>
                          <button type="button" className="w-full rounded-lg border border-[#ececee] bg-white px-3 py-2 text-left text-sm" onClick={() => setSelectedTodo(item.id)}>
                            <span>{item.title}</span>
                            <span className="ml-3 text-xs text-[#888]">{item.due ? `截止日期 ${item.due}` : "结束未设置"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {planMode === "日历" ? (
                    <div className="rounded-xl bg-white p-4 text-sm">
                      {visiblePlan.length === 0 ? <p className="text-[#888]">暂无待办</p> : visiblePlan.map((item) => (
                        <button key={item.id} type="button" className="block py-1" onClick={() => setSelectedTodo(item.id)}>{`${item.due || "结束未设置"} ${item.title}`}</button>
                      ))}
                      <p className="mt-2 text-xs text-[#888]">开始未设置 · 结束未设置</p>
                      <button type="button" className="mt-3 rounded-lg border border-[#e6e6e8] px-3 py-1.5" onClick={() => setTodoOpen(true)}>添加待办</button>
                    </div>
                  ) : null}
                  {pickedTodo ? (
                    <div className={cn("mt-4 rounded-xl border border-[#ececee] bg-white p-4", detailWide ? "max-w-4xl" : "max-w-xl")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">待办详情</p>
                        <button type="button" className="rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs" disabled={visiblePlan.findIndex((item) => item.id === pickedTodo.id) <= 0} onClick={() => { const index = visiblePlan.findIndex((item) => item.id === pickedTodo.id); const prev = visiblePlan[index - 1]; if (prev) setSelectedTodo(prev.id); }}>
                          上一条
                        </button>
                        <button type="button" className="rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs" disabled={visiblePlan.findIndex((item) => item.id === pickedTodo.id) >= visiblePlan.length - 1} onClick={() => { const index = visiblePlan.findIndex((item) => item.id === pickedTodo.id); const next = visiblePlan[index + 1]; if (next) setSelectedTodo(next.id); }}>
                          下一条
                        </button>
                        <button type="button" className="rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs" onClick={() => setDetailWide((wide) => !wide)}>
                          {detailWide ? "缩小窗口" : "放大窗口"}
                        </button>
                        {pickedTodo.parentId ? (
                          <button type="button" className="rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs" onClick={() => setSelectedTodo(pickedTodo.parentId ?? null)}>
                            返回上级
                          </button>
                        ) : null}
                        <button type="button" className="ml-auto rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs" onClick={() => { setChat(chat.trim() ? `${chat.trim()}\n${pickedTodo.title}` : pickedTodo.title); setToast("已添加到输入框"); }}>
                          添加到输入框
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[#e6e6e8] px-2 py-1 text-xs"
                          onClick={() => {
                            const text = [pickedTodo.title, pickedTodo.description].filter(Boolean).join("\n");
                            void navigator.clipboard.writeText(text).then(() => setToast("已复制为指令")).catch(() => setToast("复制失败，请稍后重试"));
                          }}
                        >
                          复制为指令
                        </button>
                        <button type="button" className="rounded-lg px-2 py-1 text-xs text-[#c04545]" disabled={pickedTodo.id.startsWith("handoff-")} onClick={() => setDeleteItemId(pickedTodo.id)}>
                          删除事项
                        </button>
                      </div>
                      <label className="mt-3 block text-sm">
                        标题
                        <input
                          aria-label="待办标题"
                          className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                          value={pickedTodo.title}
                          onChange={(event) => patchTodo(pickedTodo.id, { title: event.target.value })}
                          onFocus={(event) => { if (!titleAtFocus.current) titleAtFocus.current = event.currentTarget.value; }}
                          onBlur={(event) => { if (titleAtFocus.current && event.currentTarget.value !== titleAtFocus.current) setToast("标题已更新"); titleAtFocus.current = ""; }}
                        />
                      </label>
                      <div className="mt-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span>描述</span>
                          {descEditing ? null : (
                            <button
                              type="button"
                              className="text-xs text-[#666]"
                              onClick={() => {
                                setDescDraft(pickedTodo.description ?? "");
                                setDescEditing(true);
                              }}
                            >
                              编辑
                            </button>
                          )}
                        </div>
                        {descEditing ? (
                          <div className="mt-1">
                            <p className="text-xs text-[#888]">Markdown 编辑</p>
                            <textarea
                              aria-label="待办描述"
                              className="mt-1 h-20 w-full rounded-lg border border-[#e6e6e8] p-3"
                              value={descDraft}
                              onChange={(event) => setDescDraft(event.target.value)}
                            />
                            <p className="mt-1 text-xs text-[#888]">保存后同步到此待办描述</p>
                            <div className="mt-2 flex justify-end gap-2">
                              <button type="button" className="rounded-lg px-2 py-1 text-xs" disabled={descSaving} onClick={() => setDescEditing(false)}>
                                取消
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-[#1a1a1a] px-2 py-1 text-xs text-white disabled:opacity-40"
                                disabled={descSaving}
                                onClick={() => {
                                  const id = pickedTodo.id;
                                  const next = descDraft;
                                  setDescSaving(true);
                                  window.setTimeout(() => {
                                    patchTodo(id, { description: next });
                                    setDescSaving(false);
                                    setDescEditing(false);
                                    setToast("描述已更新");
                                  }, 400);
                                }}
                              >
                                {descSaving ? "保存中…" : "保存"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-[#444]">{pickedTodo.description?.trim() ? pickedTodo.description : "暂无事项说明。"}</p>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          状态
                          <select
                            aria-label="待办状态"
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2"
                            value={pickedTodo.status}
                            onChange={(event) => {
                              const status = event.target.value as PlanStatus;
                              const pending = directChildren(pickedTodo.id).filter((child) => child.status !== "完成");
                              if (status === "完成" && pending.length > 0) {
                                setCompleteAsk({ id: pickedTodo.id, count: pending.length });
                                return;
                              }
                              patchTodo(pickedTodo.id, { status });
                              if (status === "进行中") setToast("事项已开始");
                              else if (status === "完成") setToast("事项已完成");
                              else if (status === "暂停") setToast("事项已暂停");
                            }}
                          >
                            {PLAN_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          处理人
                          <select
                            aria-label="处理人"
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2"
                            value={pickedTodo.owner || "未设置"}
                            onChange={(event) => { patchTodo(pickedTodo.id, { owner: event.target.value }); setToast("处理人已更新"); }}
                          >
                            <option>未设置</option>
                            <option>经办人</option>
                            <option>合规</option>
                            <option>财务</option>
                          </select>
                        </label>
                        <label className="block text-sm">
                          优先级
                          <select
                            aria-label="优先级"
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2"
                            value={pickedTodo.priority || "未设置"}
                            onChange={(event) => {
                              patchTodo(pickedTodo.id, { priority: event.target.value as ProjectTodo["priority"] });
                              setToast("优先级已更新");
                            }}
                          >
                            {PLAN_PRIORITIES.map((priority) => (
                              <option key={priority}>{priority}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          标签
                          <input
                            aria-label="标签"
                            placeholder="未设置"
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                            value={pickedTodo.tags ?? ""}
                            onChange={(event) => patchTodo(pickedTodo.id, { tags: event.target.value })}
                            onBlur={() => setToast("标签已更新")}
                          />
                        </label>
                        <label className="block text-sm">
                          截止日期
                          <input
                            aria-label="截止日期"
                            type="date"
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                            value={pickedTodo.due ?? ""}
                            onChange={(event) => { patchTodo(pickedTodo.id, { due: event.target.value }); setToast("截止日期已更新"); }}
                          />
                        </label>
                      </div>
                      <div className="mt-3 rounded-lg bg-[#f7f7f8] px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">附属说明</p>
                          {pickedTodo.status === "暂停" ? (
                            <button type="button" className="ml-auto text-xs text-[#666]" onClick={() => { patchTodo(pickedTodo.id, { status: "进行中" }); setToast("事项已开始"); }}>恢复</button>
                          ) : null}
                          {pickedTodo.status === "完成" ? (
                            <button type="button" className="ml-auto text-xs text-[#666]" onClick={() => { patchTodo(pickedTodo.id, { status: "进行中" }); setToast("事项已开始"); }}>重启</button>
                          ) : null}
                          {pickedTodo.status !== "完成" ? (
                            <button type="button" className="ml-auto text-xs text-[#666]" onClick={() => {
                              const pending = directChildren(pickedTodo.id).filter((child) => child.status !== "完成");
                              if (pending.length > 0) {
                                setCompleteAsk({ id: pickedTodo.id, count: pending.length });
                                return;
                              }
                              patchTodo(pickedTodo.id, { status: "完成" });
                              setToast("事项已完成");
                            }}>完成</button>
                          ) : null}
                        </div>
                        <p className="mt-1 font-medium">{pickedTodo.status === "待开始" ? "等待启动" : pickedTodo.status === "进行中" ? "执行中" : pickedTodo.status === "暂停" ? "暂停处理中" : "已完成"}</p>
                        <p className="mt-1 text-[#666]">
                          {pickedTodo.status === "待开始"
                            ? (pickedTodo.due ? `建议在 ${pickedTodo.due} 前完成认领并开始执行。` : "请确认负责人、目标和截止时间后再推进执行。")
                            : pickedTodo.status === "进行中"
                              ? "事项正在推进中，建议持续同步最新进展。"
                              : pickedTodo.status === "暂停"
                                ? "事项已暂停，建议补充原因后再恢复执行。"
                                : "事项已完成，可继续补充说明或查看最近变更。"}
                        </p>
                      </div>
                      <p className="mt-3 text-xs text-[#888]">创建时间 刚刚 · 更新时间 刚刚</p>
                      <div className="mt-4 border-t border-[#ececee] pt-3">
                        <ul className="space-y-3">
                          {planComments.filter((comment) => comment.todoId === pickedTodo.id && !comment.parentId).map((comment) => {
                            const replies = planComments.filter((item) => item.parentId === comment.id);
                            const long = comment.body.length > 48;
                            const shown = long && expandedComment !== comment.id ? `${comment.body.slice(0, 48)}…` : comment.body;
                            return (
                              <li key={comment.id}>
                                <p className="text-sm"><span className="font-medium">{comment.author}</span> <span className="text-xs text-[#888]">刚刚</span></p>
                                <p className="mt-1 whitespace-pre-wrap text-sm">{shown}</p>
                                {long ? (
                                  <button type="button" className="text-xs text-[#666]" onClick={() => setExpandedComment(expandedComment === comment.id ? null : comment.id)}>
                                    {expandedComment === comment.id ? "收起" : "展开"}
                                  </button>
                                ) : null}
                                <div className="mt-1 flex gap-3 text-xs text-[#666]">
                                  <button type="button" onClick={() => { setReplyTo({ id: comment.id, author: comment.author }); setEditingComment(null); setCommentDraft(""); }}>回复</button>
                                  <button type="button" onClick={() => setChat(chat.trim() ? `${chat.trim()}\n${comment.body}` : comment.body)}>在对话中引用</button>
                                  <button type="button" onClick={() => setCommentMenu(commentMenu === comment.id ? null : comment.id)}>更多</button>
                                </div>
                                {commentMenu === comment.id ? (
                                  <div className="mt-1 flex gap-3 text-xs">
                                    <button type="button" onClick={() => { setEditingComment(comment.id); setCommentDraft(comment.body); setReplyTo(null); setCommentMenu(null); }}>修改</button>
                                    <button type="button" className="text-[#c04545]" onClick={() => { setPlanComments((list) => list.filter((item) => item.id !== comment.id && item.parentId !== comment.id)); setCommentMenu(null); }}>删除</button>
                                  </div>
                                ) : null}
                                {replies.length > 0 && openReplies === comment.id ? (
                                  <div className="mt-2 border-l border-[#ececee] pl-3">
                                    <ul className="space-y-2">
                                      {replies.map((reply) => (
                                        <li key={reply.id}>
                                          <p className="text-sm"><span className="font-medium">{reply.author}</span> <span className="text-xs text-[#888]">刚刚</span></p>
                                          <p className="mt-1 text-sm">{reply.body}</p>
                                          <button type="button" className="mt-1 text-xs text-[#666]" onClick={() => { setReplyTo({ id: comment.id, author: reply.author }); setEditingComment(null); setCommentDraft(""); }}>回复</button>
                                        </li>
                                      ))}
                                    </ul>
                                    <button type="button" className="mt-2 text-xs text-[#666]" onClick={() => setOpenReplies(null)}>收起回复</button>
                                  </div>
                                ) : null}
                                {replies.length > 0 && openReplies !== comment.id ? (
                                  <button type="button" className="mt-2 text-xs text-[#666]" onClick={() => setOpenReplies(comment.id)}>{`展开 ${replies.length} 条回复`}</button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                        <form
                          className="mt-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const body = commentDraft.trim();
                            if (!body || commentSending) return;
                            const todoId = pickedTodo.id;
                            if (editingComment) {
                              setPlanComments((list) => list.map((item) => (item.id === editingComment ? { ...item, body } : item)));
                              setEditingComment(null);
                              setCommentDraft("");
                              return;
                            }
                            setCommentSending(true);
                            window.setTimeout(() => {
                              setPlanComments((list) => [...list, { id: `comment-${Date.now()}`, todoId, author: role, body, parentId: replyTo?.id }]);
                              setCommentDraft("");
                              setReplyTo(null);
                              setCommentSending(false);
                              if (replyTo) setOpenReplies(replyTo.id);
                            }, 400);
                          }}
                        >
                          <textarea
                            aria-label={replyTo ? `回复 ${replyTo.author}` : "添加评论"}
                            placeholder={replyTo ? `回复 ${replyTo.author}...` : "添加评论"}
                            className="h-16 w-full rounded-lg border border-[#e6e6e8] p-2 text-sm"
                            value={commentDraft}
                            onChange={(event) => setCommentDraft(event.target.value)}
                          />
                          <button type="submit" className="mt-2 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white disabled:opacity-40" disabled={!commentDraft.trim() || commentSending}>
                            {commentSending ? "发送中..." : "发送"}
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[#888]">请选择一个事项查看详情。</p>
                  )}
                </div>
              ) : null}
              {detailTab === "任务" ? (
                <ProjectTasks
                  matters={matters}
                  panel={taskPanel}
                  query={taskQuery}
                  source={taskSource}
                  onPanel={setTaskPanel}
                  onQuery={setTaskQuery}
                  onSource={setTaskSource}
                  onOpen={(id) => navigate(`/task/${id}`)}
                  onNew={() => navigate("/")}
                />
              ) : null}
            </div>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const text = chat.trim();
                if (!text) return;
                setProjects((items) => items.map((item) => (item.name === current.name ? { ...item, notes: [...item.notes, text] } : item)));
                setChat("");
                setDetailTab("动态");
              }}
            >
              <textarea
                aria-label="项目对话"
                className="h-20 w-full rounded-xl border border-[#e6e6e8] bg-white p-3 text-sm"
                placeholder="今天帮你做些什么？@ 引用资产文件、项目待办或调用技能"
                value={chat}
                onChange={(event) => setChat(event.target.value)}
              />
              <button type="submit" className="mt-2 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                发送
              </button>
            </form>
          </div>
          {configOpen ? (
            <aside className="w-80 shrink-0 rounded-xl bg-white p-4">
              <div className="mb-3 flex gap-2 text-sm">
                {(["专家", "技能", "指令"] as const).map((item) => (
                  <button key={item} className={cn("rounded-full px-3 py-1", configTab === item && "bg-[#ececee] font-medium")} onClick={() => setConfigTab(item)}>
                    {item}
                  </button>
                ))}
              </div>
              {configTab === "专家" ? (
                <div className="space-y-2">
                  <p className="text-sm text-[#666]">配置项目专家，为成员提供更专业的服务</p>
                  {catalog.agents.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={current.experts.includes(agent.name)}
                        onChange={(event) =>
                          setProjects((items) =>
                            items.map((item) =>
                              item.name === current.name
                                ? { ...item, experts: event.target.checked ? [...item.experts, agent.name] : item.experts.filter((name) => name !== agent.name) }
                                : item,
                            ),
                          )
                        }
                      />
                      {agent.name}
                    </label>
                  ))}
                </div>
              ) : null}
              {configTab === "技能" ? (
                <div className="space-y-2">
                  <p className="text-sm text-[#666]">配置项目技能，让 AI 精准执行任务</p>
                  {current.skills.length === 0 ? <p className="text-xs text-[#888]">还没有添加技能</p> : null}
                  {catalog.skills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={current.skills.includes(skill.name)}
                        onChange={(event) =>
                          setProjects((items) =>
                            items.map((item) =>
                              item.name === current.name
                                ? { ...item, skills: event.target.checked ? [...item.skills, skill.name] : item.skills.filter((name) => name !== skill.name) }
                                : item,
                            ),
                          )
                        }
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
              ) : null}
              {configTab === "指令" ? (
                <label className="block text-sm">
                  在此项目下的所有任务都会参考这里的指令。建议提供当前项目的背景信息和规范，让 MindBuddy 的回复更精准、更符合要求。
                  <textarea
                    aria-label="项目指令"
                    className="mt-2 h-40 w-full rounded-lg border border-[#e6e6e8] p-3"
                    placeholder="当前项目暂未配置指令"
                    value={current.instruction}
                    onChange={(event) =>
                      setProjects((items) => items.map((item) => (item.name === current.name ? { ...item, instruction: event.target.value } : item)))
                    }
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white"
                    onClick={() => setToast(current.instruction.trim() ? "项目指令已保存" : "项目指令已清空")}
                  >
                    保存
                  </button>
                </label>
              ) : null}
            </aside>
          ) : null}
        </div>
        {removeName ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 text-sm">
              <p className="font-medium">移除成员</p>
              <p className="mt-2 text-[#666]">{`确定将「${removeName}」从协作中移除吗？移除后对方将无法继续参与协作。`}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRemoveName(null)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                  onClick={() => {
                    setMembers((items) => items.filter((item) => item.name !== removeName));
                    setRemoveName(null);
                    setToast("已移除成员");
                  }}
                >
                  移除成员
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {inviteOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h2 className="text-base font-semibold">邀请</h2>
              <p className="mt-3 text-sm leading-6 text-[#666]">被邀请人加入后，将可使用项目配置的 Skill / 专家，其中可能包含其无权限使用的资源。请确认后再邀请。</p>
              <p className="mt-2 text-xs text-[#888]">非项目成员需申请加入后方可进入协作</p>
              <label className="mt-4 block text-sm">
                获得链接的人
                <select
                  aria-label="获得链接的人"
                  className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2"
                  value={joinMode}
                  onChange={(event) => setJoinMode(event.target.value as "申请后加入" | "直接加入")}
                >
                  <option>申请后加入</option>
                  <option>直接加入</option>
                </select>
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setInviteOpen(false)}>
                  关闭
                </button>
                <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => setInviteCopied(true)}>
                  {inviteCopied ? "已复制邀请链接" : "复制链接"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {todoOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <form
              className="w-full max-w-md rounded-2xl bg-white p-5"
              onSubmit={(event) => {
                event.preventDefault();
                const title = todoTitle.trim();
                if (!title) return;
                setProjects((items) =>
                  items.map((item) =>
                    item.name === current.name ? { ...item, todos: [...item.todos, { id: `todo-${Date.now()}`, title, status: "待开始", priority: "未设置", owner: "未设置", description: "", due: "", tags: "" }] } : item,
                  ),
                );
                setTodoTitle("");
                setTodoOpen(false);
              }}
            >
              <h2 className="text-base font-semibold">创建</h2>
              <label className="mt-3 block text-sm">
                标题
                <input
                  aria-label="待办标题"
                  placeholder="请输入标题"
                  className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                  value={todoTitle}
                  onChange={(event) => setTodoTitle(event.target.value)}
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setTodoOpen(false)}>
                  取消
                </button>
                <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                  创建
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {planMenu ? (
          <div className="fixed inset-0 z-30" onClick={() => setPlanMenu(null)}>
            <div role="menu" aria-label="表格右键菜单" className="absolute w-64 rounded-xl border border-[#ececee] bg-white p-1 text-sm shadow-lg" style={{ left: planMenu.x, top: planMenu.y }} onClick={(event) => event.stopPropagation()}>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setSelectedTodo(planMenu.id); setPlanMenu(null); }}>
                查看详情
              </button>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7] disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => { const todo = current.todos.find((item) => item.id === planMenu.id); if (todo) setPlanClip(todo); setPlanMenu(null); }}>
                复制
              </button>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7] disabled:opacity-40" disabled={!planClip || planMenu.id.startsWith("handoff-")} onClick={() => pasteTodo(planMenu.id)}>
                粘贴
              </button>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7] disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => duplicateTodo(planMenu.id)}>
                创建副本
              </button>
              <div className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#f6f6f7]">
                <button type="button" className="text-left disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => insertRelative(planMenu.id, "above", insertCount)}>在上方插入</button>
                <input aria-label="插入项数" className="h-7 w-12 rounded border border-[#e6e6e8] px-1" value={insertCount} onChange={(event) => setInsertCount(event.target.value.replace(/\D/g, ""))} />
                <span>项</span>
              </div>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7] disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => insertRelative(planMenu.id, "below", insertCount)}>
                {`在下方插入 ${todoCount(insertCount)} 项`}
              </button>
              <div className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#f6f6f7]">
                <button type="button" className="text-left disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => addSubtodos(planMenu.id, subCount)}>添加子待办</button>
                <input aria-label="子待办项数" className="h-7 w-12 rounded border border-[#e6e6e8] px-1" value={subCount} onChange={(event) => setSubCount(event.target.value.replace(/\D/g, ""))} />
                <span>项</span>
              </div>
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-[#c04545] hover:bg-[#f6f6f7] disabled:opacity-40" disabled={planMenu.id.startsWith("handoff-")} onClick={() => { if (directChildren(planMenu.id).length > 0) { setDeleteTodoId(planMenu.id); setPlanMenu(null); } else removeTodo(planMenu.id, "cascade"); }}>
                删除
              </button>
            </div>
          </div>
        ) : null}
        {deleteTodoId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h2 className="text-base font-semibold">删除待办</h2>
              <p className="mt-2 text-sm text-[#666]">{`当前待办包含 ${directChildren(deleteTodoId).length} 条子待办，是否一并删除？`}</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setDeleteTodoId(null)}>取消</button>
                <button type="button" className="rounded-lg border border-[#e6e6e8] px-3 py-1.5 text-sm" onClick={() => removeTodo(deleteTodoId, "self")}>仅删除本条</button>
                <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => removeTodo(deleteTodoId, "cascade")}>删除本条及所有子待办</button>
              </div>
            </div>
          </div>
        ) : null}
        {batchDelete ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h2 className="text-base font-semibold">删除待办</h2>
              <p className="mt-2 text-sm text-[#666]">{`确定删除已选的 ${pickedIds.length} 个事项？删除后不可恢复。`}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setBatchDelete(false)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white"
                  onClick={() => {
                    const ids = new Set(pickedIds);
                    const count = pickedIds.length;
                    mutateTodos((todos) => todos.filter((todo) => !ids.has(todo.id)).map((todo) => (todo.parentId && ids.has(todo.parentId) ? { ...todo, parentId: undefined } : todo)));
                    if (selectedTodo && ids.has(selectedTodo)) setSelectedTodo(null);
                    setPickedIds([]);
                    setBatchDelete(false);
                    setToast(`已删除 ${count} 个事项`);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {deleteItemId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h2 className="text-base font-semibold">确认删除</h2>
              <p className="mt-2 text-sm text-[#666]">删除后该事项将不可恢复，确认要删除吗？</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setDeleteItemId(null)}>取消</button>
                <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => { removeTodo(deleteItemId, "self"); setDeleteItemId(null); setToast("事项已删除"); }}>删除</button>
              </div>
            </div>
          </div>
        ) : null}
        {completeAsk ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h2 className="text-base font-semibold">同时完成未完成的子待办？</h2>
              <p className="mt-2 text-sm text-[#666]">{`该待办下还有 ${completeAsk.count} 个子待办未完成。`}</p>
              <p className="mt-1 text-sm text-[#666]">是否将它们一并更新为「完成」？</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => { patchTodo(completeAsk.id, { status: "完成" }); setCompleteAsk(null); setToast("事项已完成"); }}>跳过子待办</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white"
                  onClick={() => {
                    const parentId = completeAsk.id;
                    mutateTodos((todos) => todos.map((todo) => (todo.id === parentId || (todo.parentId === parentId && todo.status !== "完成") ? { ...todo, status: "完成" } : todo)));
                    setCompleteAsk(null);
                    setToast("事项已完成");
                  }}
                >
                  全部更新
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm text-white">{toast}</p> : null}
      </Page>
    );
  }
  return (
    <Page title="项目" subtitle="多人协同，打造超级团队">
      <div className="mb-4 flex items-center gap-2">
        <input
          value={query}
          aria-label="搜索项目"
          placeholder="搜索项目"
          className="h-9 w-64 rounded-lg border border-[#e6e6e8] bg-white px-3 text-sm outline-none"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="ml-auto rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => setOpen(true)}>
          新建项目
        </button>
      </div>
      <h2 className="mb-2 text-sm font-medium">我的项目</h2>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e0e0e2] bg-white p-8 text-center">
          <p className="text-sm font-medium">{query ? "没有匹配的项目" : "创建你的第一个项目"}</p>
          {query ? null : <p className="mt-1 text-xs text-[#888]">共享团队上下文，让成员与 AI 协同共创</p>}
        </div>
      ) : (
        <ul className="grid max-w-3xl gap-2">
          {visible.map((item) => (
            <li key={item.name} className="relative flex items-center rounded-xl border border-[#ececee] bg-white px-4 py-3 text-sm">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActive(item.name); setDetailTab("动态"); setConfigOpen(false); setSelectedTodo(null); }}>
                <span className="font-medium">{item.name}</span>
                {item.pinned ? <span className="ml-2 rounded bg-[#ececee] px-1.5 py-0.5 text-xs">已置顶</span> : null}
                <span className="mt-1 block text-xs text-[#888]">{item.template} · 添加于 刚刚</span>
              </button>
              <button type="button" aria-label={`${item.name} 更多操作`} className="rounded-lg px-2 py-1" onClick={() => setMenuFor(menuFor === item.name ? null : item.name)}>
                ···
              </button>
              {menuFor === item.name ? (
                <div className="absolute right-3 top-12 z-10 w-28 rounded-lg border border-[#ececee] bg-white p-1 shadow">
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left"
                    onClick={() => {
                      setRenameFor(item.name);
                      setRenameValue(item.name);
                      setMenuFor(null);
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left"
                    onClick={() => {
                      setProjects((list) => list.map((row) => (row.name === item.name ? { ...row, pinned: !row.pinned } : row)));
                      setToast(item.pinned ? `已取消置顶「${item.name}」` : `已置顶「${item.name}」`);
                      setMenuFor(null);
                    }}
                  >
                    {item.pinned ? "取消置顶" : "置顶"}
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-[#c04545]"
                    onClick={() => {
                      setDeleteFor(item.name);
                      setMenuFor(null);
                    }}
                  >
                    删除
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-md rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              setProjects((items) => [
                { name: name.trim(), template, pinned: false, experts: [], skills: [], instruction: draftInstruction, todos: [], notes: [] },
                ...items,
              ]);
              setName("");
              setOpen(false);
            }}
          >
            <h2 className="text-base font-semibold">新建项目</h2>
            <label className="mt-3 block text-sm">
              项目名称
              <input
                value={name}
                aria-label="项目名称"
                placeholder="请输入项目名称"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              项目模板
              <select
                aria-label="项目模板"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2"
                value={template}
                onChange={(event) => {
                  const next = event.target.value;
                  setTemplate(next);
                  setDraftInstruction(PROJECT_TEMPLATES.find((item) => item.title === next)?.desc ?? "");
                }}
              >
                {PROJECT_TEMPLATES.map((item) => (
                  <option key={item.title}>{item.title}</option>
                ))}
              </select>
              {templateDesc ? <span className="mt-1 block text-xs text-[#888]">{templateDesc}</span> : null}
              <span className="mt-1 block text-xs text-[#888]">切换模版会覆盖当前编辑内容</span>
            </label>
            <label className="mt-3 block text-sm">
              指令
              <textarea
                aria-label="项目指令"
                className="mt-1 h-24 w-full rounded-lg border border-[#e6e6e8] p-3"
                placeholder="提供当前项目的背景信息和规范，让 MindBuddy 的回复更精准、更符合要求。比如：项目目标、团队习惯、风格偏好、输出约束等"
                value={draftInstruction}
                onChange={(event) => setDraftInstruction(event.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                确定
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {renameFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-md rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const next = renameValue.trim();
              if (!next || projects.some((item) => item.name === next && item.name !== renameFor)) return;
              setProjects((items) => items.map((item) => (item.name === renameFor ? { ...item, name: next } : item)));
              setToast(`已重命名为「${next}」`);
              setRenameFor(null);
            }}
          >
            <h2 className="text-base font-semibold">重命名项目</h2>
            <p className="mt-2 text-sm text-[#666]">原名称：{renameFor}</p>
            <input
              aria-label="新的项目名称"
              placeholder="输入新的项目名称"
              className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setRenameFor(null)}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {deleteFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h2 className="text-base font-semibold">删除项目</h2>
            <p className="mt-3 text-sm leading-6 text-[#444]">确定要删除此项目吗？删除后项目将被永久删除，包括项目内所有任务及产物，且不可恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setDeleteFor(null)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#c04545] px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  setProjects((items) => items.filter((item) => item.name !== deleteFor));
                  setToast(`「${deleteFor}」已删除`);
                  setDeleteFor(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm text-white">{toast}</p> : null}
    </Page>
  );
}

function ConnectorBoard({ tools }: { tools: McpTool[] }) {
  useSyncExternalStore(subscribeConnectorLinks, getConnectorOverrides);
  const [tab, setTab] = useState<"官方内置" | "企业连接器">("官方内置");
  const [query, setQuery] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const needle = query.trim();
  const visible = tools.filter((tool) => !needle || tool.name.includes(needle) || tool.purpose.includes(needle));
  const authTool = tools.find((tool) => tool.id === authId);
  const dropTool = tools.find((tool) => tool.id === dropId);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium">连接器</h2>
        {(["官方内置", "企业连接器"] as const).map((item) => (
          <button key={item} type="button" className={cn("rounded-full px-3 py-1 text-sm", tab === item && "bg-[#ececee] font-medium")} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
        <button type="button" className="ml-auto rounded-lg border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm">
          自定义连接器
        </button>
      </div>
      <Search label="搜索连接器" value={query} onValue={setQuery} />
      {notice ? <p className="mb-3 text-sm text-[#666]">{notice}</p> : null}
      {tab === "企业连接器" ? (
        <div className="text-sm text-[#888]">
          <p>暂无连接器</p>
          <p className="mt-1">可用连接器将在此显示</p>
        </div>
      ) : null}
      {tab === "官方内置" && visible.length === 0 ? <p className="text-sm text-[#888]">未找到匹配的连接器，换个关键词试试</p> : null}
      {tab === "官方内置" && visible.length > 0 ? (
        <ul className="grid max-w-3xl gap-2">
          {visible.map((tool) => {
            const linked = isConnectorLinked(tool.id, tool.connected);
            const linking = linkingId === tool.id;
            return (
              <li key={tool.id} className="rounded-xl border border-[#ececee] bg-white p-4 text-sm">
                <div className="flex items-center gap-3">
                  <p className="font-medium">{tool.name}</p>
                  <button type="button" className="ml-auto text-[#666]" disabled={linking} onClick={() => (linked ? setDropId(tool.id) : setAuthId(tool.id))}>
                    {linking ? "连接中..." : linked ? "断开" : "连接"}
                  </button>
                </div>
                <p className="mt-1 text-[#666]">{tool.purpose}</p>
                <p className="mt-1 text-xs text-[#888]">{linking ? "连接中..." : linked ? "已连接" : "未连接"}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {authTool ? (
        <div role="dialog" aria-label={`授权 ${authTool.name}`} className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">授权 {authTool.name}</p>
            <p className="mt-2 text-[#666]">点击连接将引导您完成授权流程</p>
            <ul className="mt-3 space-y-1 text-[#666]">
              <li>读取与你相关的数据</li>
              <li>在你不在线时执行任务</li>
              <li>可随时在连接器面板撤销授权</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAuthId(null)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  const id = authTool.id;
                  const name = authTool.name;
                  setAuthId(null);
                  setLinkingId(id);
                  setNotice("将跳转页面授权连接...");
                  window.setTimeout(() => {
                    setConnectorLinked(id, true);
                    setLinkingId(null);
                    setNotice(`连接器 ${name} 已连接`);
                  }, 400);
                }}
              >
                授权并继续
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dropTool ? (
        <div role="dialog" aria-label={`断开 ${dropTool.name}`} className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">断开 {dropTool.name}</p>
            <p className="mt-2 text-[#666]">{`断开后，你的 ${dropTool.name} 授权账号将立即失效，是否确定继续？`}</p>
            <p className="mt-2 text-[#666]">你在所有项目中通过此连接器进行的连接将立即中断，包括你已开通的公共授权。</p>
            <p className="mt-2 text-[#666]">后续如需继续使用，需要重新完成 {dropTool.name} 的授权。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDropId(null)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  setConnectorLinked(dropTool.id, false);
                  setNotice(`连接器 ${dropTool.name} 已断开`);
                  setDropId(null);
                }}
              >
                确认断开
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ExpertsPage({ tab }: { tab: "experts" | "skills" | "connectors" }) {
  const catalog = useMind((s) => s.catalog);
  const [skillTab, setSkillTab] = useState<(typeof SKILL_TABS)[number]>("推荐");
  const [expertMine, setExpertMine] = useState<"全部" | "最近使用" | "我创建的">("全部");
  const [query, setQuery] = useState("");
  const [installed, setInstalled] = useState<string[]>([]);
  const [uninstallId, setUninstallId] = useState<string | null>(null);
  const [skillNotice, setSkillNotice] = useState<string | null>(null);
  const needle = query.trim();
  useEffect(() => {
    setQuery("");
  }, [tab]);
  const agents = catalog.agents.filter((agent) => !needle || agent.name.includes(needle) || agent.duty.includes(needle));
  const skills = catalog.skills.filter((skill) => !needle || skill.name.includes(needle) || skill.steps.some((step) => step.name.includes(needle)));
  return (
    <Page title="专家·技能·连接器">
      <div className="mb-4 flex gap-1 text-sm">
        {EXPERT_TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn("rounded-full px-3 py-1.5", isActive ? "bg-[#1a1a1a] text-white" : "bg-white text-[#444]")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      {tab === "experts" ? (
        <>
          <Search label="搜索专家职称或描述" value={query} onValue={setQuery} />
          <h2 className="mb-2 text-sm font-medium">我的专家</h2>
          <div className="mb-3 flex gap-2 text-sm">
            {(["全部", "最近使用", "我创建的"] as const).map((item) => (
              <button key={item} type="button" className={cn("rounded-full px-3 py-1", expertMine === item && "bg-[#ececee] font-medium")} onClick={() => setExpertMine(item)}>
                {item}
              </button>
            ))}
          </div>
          {expertMine === "最近使用" ? (
            <div className="mb-4 text-sm text-[#888]">
              <p>还没有最近使用的专家</p>
              <p className="mt-1">在专家中心召唤专家后会展示在这里</p>
            </div>
          ) : null}
          {expertMine === "我创建的" ? (
            <div className="mb-4 text-sm text-[#888]">
              <p>还没有创建任何专家</p>
              <p className="mt-1">创建属于你的专家，分享专业知识</p>
            </div>
          ) : null}
          {expertMine === "全部" && agents.length === 0 ? <p className="mb-4 text-sm text-[#888]">暂无该分类的专家</p> : null}
          <ul className="grid max-w-3xl gap-2">
            {expertMine === "全部" ? agents.map((agent) => (
              <li key={agent.id} className="rounded-xl border border-[#ececee] bg-white p-4">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="mt-1 text-sm text-[#666]">{agent.duty}</p>
              </li>
            )) : null}
          </ul>
          <h2 className="mb-2 mt-6 text-sm font-medium">专家团</h2>
          <p className="text-sm text-[#888]">暂无专家团</p>
        </>
      ) : null}
      {tab === "skills" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1 text-sm">
            {SKILL_TABS.map((item) => (
              <button
                key={item}
                className={cn("rounded-full px-3 py-1", skillTab === item ? "bg-[#ececee] font-medium" : "text-[#666]")}
                onClick={() => setSkillTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <Search label={skillTab === "已安装" ? "搜索已安装的技能" : "搜索技能"} value={query} onValue={setQuery} />
          {skillNotice ? <p className="mb-2 text-sm text-[#444]">{skillNotice}</p> : null}
          {skillTab === "企业 Skill" ? <p className="text-sm text-[#888]">当前企业暂无可见的自建 Skill</p> : null}
          {skillTab === "套件" ? <p className="text-sm text-[#888]">暂无已安装的套件</p> : null}
          {skillTab === "推荐" && skills.length === 0 ? <p className="text-sm text-[#888]">未找到匹配的 Skill，换个关键词试试</p> : null}
          {skillTab === "推荐" ? (
            <ul className="grid max-w-3xl gap-2">
              {skills.map((skill) => {
                const done = installed.includes(skill.id);
                return (
                  <li key={skill.id} className="rounded-xl border border-[#ececee] bg-white p-4 text-sm">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{skill.name}</p>
                      <button
                        type="button"
                        className="ml-auto text-[#666]"
                        disabled={done}
                        onClick={() => {
                          setInstalled((current) => [...current, skill.id]);
                          setSkillNotice(`「${skill.name}」技能已安装`);
                        }}
                      >
                        {done ? "已安装" : "安装"}
                      </button>
                    </div>
                    <p className="mt-1 text-[#666]">{skill.steps.map((step) => step.name).join(" · ")}</p>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {skillTab === "已安装" && skills.filter((skill) => installed.includes(skill.id) && (!needle || skill.name.includes(needle))).length === 0 ? (
            <p className="text-sm text-[#888]">{needle ? "没有找到匹配的技能" : "还没有安装任何技能"}</p>
          ) : null}
          {skillTab === "已安装" && skills.some((skill) => installed.includes(skill.id) && (!needle || skill.name.includes(needle))) ? (
            <div>
              <p className="mb-2 text-xs text-[#888]">来自市场</p>
              <ul className="grid max-w-3xl gap-2">
                {skills
                  .filter((skill) => installed.includes(skill.id) && (!needle || skill.name.includes(needle)))
                  .map((skill) => (
                    <li key={skill.id} className="flex items-center rounded-xl border border-[#ececee] bg-white p-4 text-sm">
                      <span className="font-medium">{skill.name}</span>
                      <span className="ml-2 text-xs text-[#888]">已安装</span>
                      <button type="button" className="ml-auto text-[#666]" onClick={() => setUninstallId(skill.id)}>卸载</button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {uninstallId ? (
            <div role="dialog" aria-label="卸载技能" className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
              <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
                <p className="font-medium">卸载技能</p>
                <p className="mt-2 text-[#666]">确定卸载该技能吗？</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setUninstallId(null)}>取消</button>
                  <button
                    type="button"
                    className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                    onClick={() => {
                      setInstalled((current) => current.filter((id) => id !== uninstallId));
                      setUninstallId(null);
                    }}
                  >
                    卸载
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {tab === "connectors" ? <ConnectorBoard tools={catalog.mcps} /> : null}
    </Page>
  );
}

const INTERVALS = ["每 30 分钟", "每 1 小时", "每 2 小时", "每 4 小时", "每 8 小时"] as const;
const SCHEDULES = ["每天", "每个工作日", "每周", "每周一", "双周", "每月", "每月 1 号", "每年", "按间隔", "按小时"] as const;
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

type ScheduleDetail = {
  mode: "周期任务" | "单次任务";
  frequency: (typeof SCHEDULES)[number];
  weekdays: string[];
  monthDays: number[];
  yearMonth: string;
  yearDay: string;
  onceDate: string;
  time: string;
  hourEvery: string;
};

function scheduleProblem(detail: ScheduleDetail, interval: string) {
  if (detail.mode === "单次任务") {
    if (!detail.onceDate) return "请选择单次执行日期";
    const stamp = new Date(`${detail.onceDate}T${detail.time || "00:00"}`);
    if (Number.isNaN(stamp.getTime()) || stamp.getTime() <= Date.now()) return "单次执行时间必须晚于当前时间";
    return null;
  }
  if ((detail.frequency === "每周" || detail.frequency === "双周") && detail.weekdays.length === 0) return "请至少选择一个星期";
  if (detail.frequency === "每月" && detail.monthDays.length === 0) return "请至少选择一个日期";
  if (detail.frequency === "每年" && !detail.yearMonth) return "请选择月份";
  if (detail.frequency === "每年" && !detail.yearDay) return "请选择日期";
  if (detail.frequency === "按间隔" && interval === "每 30 分钟") return "按间隔执行需至少每 1 小时";
  if (detail.frequency === "按小时" && !(Number(detail.hourEvery) >= 1)) return "按间隔执行需至少每 1 小时";
  return null;
}

function scheduleSummary(detail: ScheduleDetail, interval: string) {
  const time = detail.time.trim();
  if (detail.mode === "单次任务") return `单次 ${detail.onceDate} ${time}`.trim();
  if (detail.frequency === "每周" || detail.frequency === "双周") {
    const days = detail.weekdays.join(" ");
    return time ? `${detail.frequency} ${days} ${time}` : `${detail.frequency} ${days}`;
  }
  if (detail.frequency === "每月") {
    const days = detail.monthDays.join(" ");
    return time ? `每月 ${days} · ${time}` : `每月 ${days}`;
  }
  if (detail.frequency === "每年") return time ? `每年 ${detail.yearMonth}月${detail.yearDay}日 · ${time}` : `每年 ${detail.yearMonth}月${detail.yearDay}日`;
  if (detail.frequency === "按小时") return `每 ${detail.hourEvery} 小时`;
  if (detail.frequency === "按间隔") return time ? `${interval} ${time}` : interval;
  return time ? `${detail.frequency} ${time}` : detail.frequency;
}
const AUTO_TEMPLATES = [
  { title: "每日 AI 新闻推送", content: "关注当天 AI 领域的重要动态，侧重 AI coding 与具身智能进展，筛选 3-5 条值得关注的信息。" },
  { title: "每日 5 个英语单词", content: "每天推荐 5 个高频实用英语单词，包含词义、音标、例句与记忆提示。" },
  { title: "每周工作周报", content: "每周五汇总仓库 PR 与 Issue 进展，输出关键变更与待关注事项。" },
  { title: "历史上的今天", content: "从科技、电影、音乐等领域挑选一件今天发生过的有趣事件，200-300 字讲清来龙去脉。" },
] as const;

type AutoTask = {
  id: string;
  name: string;
  schedule: string;
  source: "云端" | "项目";
  prompt: string;
  connectors: string[];
  paused: boolean;
  archived: boolean;
  external?: boolean;
  expert?: string;
  permission?: "免确认执行" | "需逐次确认";
  scheduleDetail?: ScheduleDetail;
};

export function AutomationPage() {
  const connectors = useMind((s) => s.catalog.mcps);
  const agents = useMind((s) => s.catalog.agents);
  const [tab, setTab] = useState<"tasks" | "records">("tasks");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"全部" | "项目" | "云端">("全部");
  const [recordFilter, setRecordFilter] = useState<"全部" | "成功" | "失败" | "运行中">("全部");
  const [batch, setBatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [archiveView, setArchiveView] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState<(typeof SCHEDULES)[number]>("每天");
  const [interval, setIntervalValue] = useState<(typeof INTERVALS)[number]>("每 1 小时");
  const [picked, setPicked] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expert, setExpert] = useState("不使用专家");
  const [permission, setPermission] = useState<"免确认执行" | "需逐次确认">("需逐次确认");
  const [formError, setFormError] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"周期任务" | "单次任务">("周期任务");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [monthDays, setMonthDays] = useState<number[]>([]);
  const [yearMonth, setYearMonth] = useState("");
  const [yearDay, setYearDay] = useState("");
  const [onceDate, setOnceDate] = useState("");
  const [execTime, setExecTime] = useState("");
  const [hourEvery, setHourEvery] = useState("1");
  const [records, setRecords] = useState<{ id: string; name: string; status: "成功" | "失败" | "运行中"; source?: "云端" | "项目"; deleted?: boolean; day: "今天" | "昨天" }[]>([
    { id: "rec-words", name: "每日 5 个英语单词", status: "成功", source: "云端", day: "今天" },
    { id: "rec-weekly", name: "每周工作周报", status: "成功", source: "项目", day: "今天" },
    { id: "rec-weekly-2", name: "每周工作周报", status: "失败", source: "项目", day: "昨天" },
  ]);
  const [tasks, setTasks] = useState<AutoTask[]>([
    {
      id: "daily-ai",
      name: "每日 AI 新闻推送",
      schedule: "每天",
      source: "云端",
      prompt: AUTO_TEMPLATES[0].content,
      connectors: [],
      paused: false,
      archived: false,
    },
    {
      id: "mini-words",
      name: "每日 5 个英语单词",
      schedule: "每天",
      source: "云端",
      prompt: AUTO_TEMPLATES[1].content,
      connectors: [],
      paused: false,
      archived: false,
      external: true,
    },
    {
      id: "project-weekly",
      name: "每周工作周报",
      schedule: "每周",
      source: "项目",
      prompt: AUTO_TEMPLATES[2].content,
      connectors: [],
      paused: false,
      archived: false,
      external: true,
    },
  ]);
  const needle = query.trim();
  const runningNames = new Set(records.filter((item) => item.status === "运行中").map((item) => item.name));
  const visible = tasks.filter((task) => {
    if (archiveView ? !task.archived : task.archived) return false;
    if (source !== "全部" && task.source !== source) return false;
    return !needle || task.name.includes(needle) || task.prompt.includes(needle);
  });
  const deleting = tasks.find((task) => task.id === deleteId);
  const detail = tasks.find((task) => task.id === detailId) ?? null;

  function runNow(task: AutoTask) {
    if (records.some((item) => item.name === task.name && item.status === "运行中")) {
      setToast("任务正在执行中，请稍后再试");
      return;
    }
    const id = `rec-${Date.now()}`;
    setRecords((items) => [{ id, name: task.name, status: "运行中", day: "今天" }, ...items]);
    setToast("已触发测试运行。测试运行不会影响正式调度时间。");
    window.setTimeout(() => {
      setRecords((items) => items.map((item) => (item.id === id ? { ...item, status: "成功" } : item)));
    }, 800);
  }

  function openCreate(next?: { name: string; prompt: string }) {
    setEditingId(null);
    setName(next?.name ?? "");
    setPrompt(next?.prompt ?? "");
    setSchedule("每天");
    setPicked([]);
    setExpert("不使用专家");
    setPermission("需逐次确认");
    setFormError("");
    setScheduleMode("周期任务");
    setWeekdays([]);
    setMonthDays([]);
    setYearMonth("");
    setYearDay("");
    setOnceDate("");
    setExecTime("");
    setHourEvery("1");
    setTemplatesOpen(false);
    setOpen(true);
  }

  function resetSchedule(detail?: ScheduleDetail, fallback?: string) {
    const intervalMatch = !!fallback && (INTERVALS as readonly string[]).includes(fallback);
    setScheduleMode(detail?.mode ?? "周期任务");
    setSchedule(detail?.frequency ?? (intervalMatch ? "按间隔" : (SCHEDULES as readonly string[]).includes(fallback ?? "") ? (fallback as (typeof SCHEDULES)[number]) : "每天"));
    if (detail?.frequency === "按间隔") setIntervalValue((INTERVALS as readonly string[]).includes(fallback ?? "") ? (fallback as (typeof INTERVALS)[number]) : "每 1 小时");
    else if (intervalMatch) setIntervalValue(fallback as (typeof INTERVALS)[number]);
    setWeekdays(detail?.weekdays ?? []);
    setMonthDays(detail?.monthDays ?? []);
    setYearMonth(detail?.yearMonth ?? "");
    setYearDay(detail?.yearDay ?? "");
    setOnceDate(detail?.onceDate ?? "");
    setExecTime(detail?.time ?? "");
    setHourEvery(detail?.hourEvery ?? "1");
  }

  function openEdit(task: AutoTask) {
    setEditingId(task.id);
    setName(task.name);
    setPrompt(task.prompt);
    resetSchedule(task.scheduleDetail, task.schedule);
    setPicked(task.connectors);
    setExpert(task.expert || "不使用专家");
    setPermission(task.permission ?? "需逐次确认");
    setFormError("");
    setOpen(true);
  }

  return (
    <Page title="定时任务" subtitle="管理定时任务并查看近期运行记录。定时任务仅支持「定时执行」一种触发形态。">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button className={cn("rounded-full px-3 py-1", tab === "tasks" && "bg-[#ececee] font-medium")} onClick={() => setTab("tasks")}>
          定时任务
        </button>
        <button className={cn("rounded-full px-3 py-1", tab === "records" && "bg-[#ececee] font-medium")} onClick={() => setTab("records")}>
          运行记录
        </button>
        <button type="button" className="ml-auto rounded-lg bg-white px-3 py-1.5" onClick={() => setTemplatesOpen(true)}>
          从模版添加
        </button>
        <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => openCreate()}>
          添加定时任务
        </button>
      </div>
      <Search label="搜索定时任务/记录" value={query} onValue={setQuery} />
      {tab === "tasks" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#888]">任务来源</span>
          {(["全部", "项目", "云端"] as const).map((item) => (
            <button key={item} type="button" className={cn("rounded-full px-3 py-1", source === item && "bg-white font-medium")} onClick={() => setSource(item)}>
              {item}
            </button>
          ))}
          <button type="button" className={cn("rounded-full px-3 py-1", archiveView && "bg-white font-medium")} onClick={() => setArchiveView((value) => !value)}>
            已归档
          </button>
          <button type="button" className="ml-auto rounded-lg bg-white px-3 py-1" onClick={() => { setQuery(""); setSource("全部"); setArchiveView(false); }}>
            刷新
          </button>
          <button type="button" className="rounded-lg bg-white px-3 py-1" onClick={() => setBatch((value) => !value)}>
            {batch ? "退出管理" : "批量管理"}
          </button>
          {source !== "全部" ? <p className="w-full text-xs text-[#888]">{`已筛选：${source} 来源`}</p> : null}
        </div>
      ) : (
        <div className="mb-3 flex gap-2 text-sm">
          {(["全部", "成功", "失败", "运行中"] as const).map((item) => (
            <button key={item} type="button" className={cn("rounded-full px-3 py-1", recordFilter === item && "bg-white font-medium")} onClick={() => setRecordFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
      {tab === "records" ? (
        records.filter((item) => (recordFilter === "全部" || item.status === recordFilter) && (!needle || item.name.includes(needle))).length === 0 ? (
          <p className="text-sm text-[#888]">{needle ? "没有匹配的记录" : recordFilter === "成功" ? "暂无已完成记录" : recordFilter !== "全部" ? "没有匹配的记录" : "暂无运行记录"}</p>
        ) : (
          <div className="grid max-w-3xl gap-4">
            {(["今天", "昨天"] as const).map((day) => {
              const rows = records.filter((item) => item.day === day && (recordFilter === "全部" || item.status === recordFilter) && (!needle || item.name.includes(needle)));
              if (rows.length === 0) return null;
              return (
                <section key={day}>
                  <h2 className="mb-2 text-xs text-[#888]">{day}</h2>
                  <ul className="grid gap-2">
                    {rows.map((item) => (
                      <li key={item.id} className="rounded-xl bg-white px-4 py-3 text-sm">
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-1 text-[#666]">{item.status === "运行中" ? "运行中..." : item.status}</p>
                        {item.source === "项目" ? <p className="mt-1 text-xs text-[#888]">该记录来自项目，当前仅展示执行状态</p> : null}
                        {item.source === "云端" ? <p className="mt-1 text-xs text-[#888]">该记录来自小程序/APP，当前仅展示执行状态</p> : null}
                        {item.deleted ? <p className="mt-1 text-xs text-[#888]">已删除的定时任务</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : null}
      {tab === "tasks" && detail ? (
        <div className="max-w-3xl rounded-xl border border-[#ececee] bg-white p-5 text-sm">
          <button type="button" className="text-[#666]" onClick={() => setDetailId(null)}>
            定时任务
          </button>
          <h2 className="mt-3 text-base font-semibold">{detail.name}</h2>
          <p className="mt-1 text-xs text-[#888]">创建时间 刚刚</p>
          <p className="mt-3 text-[#666]">{detail.prompt}</p>
          <p className="mt-3">运行历史 ({records.filter((item) => item.name === detail.name).length})</p>
          <ul className="mt-2 space-y-1">
            {records.filter((item) => item.name === detail.name).length === 0 ? <li className="text-[#888]">暂无运行记录</li> : null}
            {records
              .filter((item) => item.name === detail.name)
              .slice(0, historyOpen ? undefined : 1)
              .map((item) => (
                <li key={item.id}>
                  {item.status === "运行中" ? "运行中..." : item.status}
                  {item.source === "项目" ? <span className="ml-2 text-xs text-[#888]">该记录来自项目，当前仅展示执行状态</span> : null}
                  {item.source === "云端" ? <span className="ml-2 text-xs text-[#888]">该记录来自小程序/APP，当前仅展示执行状态</span> : null}
                  {item.deleted ? <span className="ml-2 text-xs text-[#888]">已删除的定时任务</span> : null}
                </li>
              ))}
          </ul>
          {records.filter((item) => item.name === detail.name).length > 1 ? (
            <button type="button" className="mt-2 text-[#666]" onClick={() => setHistoryOpen((open) => !open)}>
              {historyOpen ? "收起" : "展开更多"}
            </button>
          ) : null}
          {detail.external ? (
            <p className="mt-3 text-[#666]">{detail.source === "项目" ? "此任务由项目创建，需前往对应项目查看和管理" : "此任务由小程序/APP创建，需前往对应入口查看和管理"}</p>
          ) : null}
          <div className="mt-4 flex gap-2">
            {detail.external ? null : (
              <>
                <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => runNow(detail)}>
                  立即运行
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTasks((items) => items.map((item) => (item.id === detail.id ? { ...item, archived: !item.archived } : item)));
                    if (!detail.archived) setToast("已归档");
                    setDetailId(null);
                    setArchiveView(!detail.archived);
                  }}
                >
                  {detail.archived ? "取消归档" : "归档"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {tab === "tasks" && !detail && batch ? (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span>已选择{selected.length}项</span>
          <button
            type="button"
            onClick={() => setSelected(selected.length === visible.length ? [] : visible.map((task) => task.id))}
          >
            {selected.length === visible.length && visible.length > 0 ? "取消" : "全选"}
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => setBatchConfirm(true)}
          >
            删除
          </button>
        </div>
      ) : null}
      {tab === "tasks" && !detail && visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e0e0e2] bg-white p-8 text-center text-sm text-[#666]">
          {needle || source !== "全部" ? "没有匹配的自动化任务" : archiveView ? "暂无归档记录" : "开启你的第一个定时任务吧"}
        </div>
      ) : null}
      {tab === "tasks" && !detail && visible.length > 0 ? (
        <ul className="grid max-w-3xl gap-2">
          {[...visible].sort((a, b) => Number(runningNames.has(b.name)) - Number(runningNames.has(a.name))).map((task, index, ordered) => {
            const running = runningNames.has(task.name);
            const previous = ordered[index - 1];
            const showHeading = !archiveView && (!previous || runningNames.has(previous.name) !== running);
            return (
            <Fragment key={task.id}>
            {showHeading ? <li className="list-none pt-2 text-xs text-[#888]">{running ? "执行中" : "已安排"}</li> : null}
            <li className="rounded-xl border border-[#ececee] bg-white p-4 text-sm">
              <div className="flex items-start gap-2">
                {batch ? (
                  <input
                    type="checkbox"
                    aria-label={`选择 ${task.name}`}
                    checked={selected.includes(task.id)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id)))
                    }
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <button type="button" className="font-medium" onClick={() => { setHistoryOpen(false); setDetailId(task.id); }}>
                    {task.name}
                  </button>
                  <p className="mt-1 text-[#666]">
                    {task.schedule} · {task.source} · {task.paused ? "任务已暂停执行" : "任务正按设定计划执行"}
                  </p>
                  <p className="mt-1 text-xs text-[#888]">连接器 {task.connectors.length ? task.connectors.join("、") : "未选择 (0)"}</p>
                  {task.external ? (
                    <p className="mt-1 text-xs text-[#888]">{task.source === "项目" ? "此任务由项目创建，需前往对应项目查看和管理" : "此任务由小程序/APP创建，需前往对应入口查看和管理"}</p>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 text-[#666]"
                    onClick={() => {
                      setQuery(task.name);
                      setTab("records");
                    }}
                  >
                    查看运行详情
                  </button>
                </div>
                {task.external ? null : (
                  <>
                    <button type="button" className="text-[#666]" onClick={() => openEdit(task)}>
                      编辑
                    </button>
                    <button type="button" className="text-[#666]" onClick={() => runNow(task)}>
                      立即运行
                    </button>
                    <button type="button" className="text-[#666]" onClick={() => setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, paused: !item.paused } : item)))}>
                      {task.paused ? "恢复" : "暂停"}
                    </button>
                    <button type="button" className="text-[#666]" onClick={() => setDeleteId(task.id)}>
                      删除
                    </button>
                    <button
                      type="button"
                      className="text-[#666]"
                      onClick={() => {
                        setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, archived: !item.archived } : item)));
                        if (!task.archived) setToast("已归档");
                      }}
                    >
                      {task.archived ? "取消归档" : "归档"}
                    </button>
                  </>
                )}
              </div>
            </li>
            </Fragment>
            );
          })}
        </ul>
      ) : null}
      {tab === "tasks" && !detail && !archiveView && visible.length > 0 && !visible.some((task) => runningNames.has(task.name)) ? (
        <div className="mt-4 max-w-3xl">
          <p className="text-xs text-[#888]">执行中</p>
          <p className="mt-2 text-sm text-[#888]">暂无执行中的定时任务</p>
        </div>
      ) : null}
      {tab === "tasks" && !detail && !archiveView && visible.length > 0 && visible.every((task) => runningNames.has(task.name)) ? (
        <div className="mt-4 max-w-3xl">
          <p className="text-xs text-[#888]">已安排</p>
          <p className="mt-2 text-sm text-[#888]">暂无已安排的定时任务</p>
        </div>
      ) : null}
      {templatesOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5">
            <h2 className="text-base font-semibold">定时任务模版</h2>
            <ul className="mt-3 space-y-2">
              {AUTO_TEMPLATES.map((item) => (
                <li key={item.title} className="rounded-xl border border-[#ececee] p-3 text-sm">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-[#666]">{item.content}</p>
                  <button type="button" className="mt-2 text-sm" onClick={() => openCreate({ name: item.title, prompt: item.content })}>
                    添加
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setTemplatesOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setFormError("请填写定时任务名称");
                return;
              }
              if (!prompt.trim()) {
                setFormError("请填写提示词");
                return;
              }
              const detail: ScheduleDetail = { mode: scheduleMode, frequency: schedule, weekdays, monthDays, yearMonth, yearDay, onceDate, time: execTime, hourEvery };
              const problem = scheduleProblem(detail, interval);
              if (problem) {
                setFormError(problem);
                return;
              }
              const when = scheduleSummary(detail, interval);
              const nextExpert = expert === "不使用专家" ? "" : expert;
              if (editingId) {
                setTasks((items) =>
                  items.map((item) =>
                    item.id === editingId ? { ...item, name: name.trim(), schedule: when, prompt: prompt.trim(), connectors: picked, expert: nextExpert, permission, scheduleDetail: detail } : item,
                  ),
                );
                setToast("定时任务已保存");
              } else {
                setTasks((items) => [
                  { id: `auto-${Date.now()}`, name: name.trim(), schedule: when, source: "云端", prompt: prompt.trim(), connectors: picked, paused: false, archived: false, expert: nextExpert, permission, scheduleDetail: detail },
                  ...items,
                ]);
              }
              setOpen(false);
              setEditingId(null);
              setTab("tasks");
            }}
          >
            <h2 className="text-base font-semibold">{editingId ? "编辑定时任务" : "添加定时任务"}</h2>
            <p className="mt-1 text-xs text-[#888]">定时任务仅支持「定时执行」一种触发形态</p>
            <label className="mt-3 block text-sm">
              名称
              <input value={name} aria-label="定时任务名称" placeholder={editingId ? "输入任务名称" : "例如：每日同步项目动态"} className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="mt-3 block text-sm">
              提示词
              <textarea value={prompt} aria-label="定时任务内容" placeholder={editingId ? "添加提示词" : "在这里输入要让 AI 完成的内容，例如：汇总过去 24 小时的项目动态，并整理待跟进事项。"} className="mt-1 h-24 w-full rounded-lg border border-[#e6e6e8] p-3" onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <div className="mt-3 flex gap-2 text-sm">
              {(["周期任务", "单次任务"] as const).map((item) => (
                <button key={item} type="button" className={cn("rounded-full px-3 py-1", scheduleMode === item && "bg-[#ececee] font-medium")} aria-pressed={scheduleMode === item} onClick={() => setScheduleMode(item)}>
                  {item}
                </button>
              ))}
            </div>
            {scheduleMode === "周期任务" ? (
            <label className="mt-3 block text-sm">
              {editingId ? "执行频率" : "定时执行"}
              <select aria-label="执行计划" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={schedule} onChange={(event) => setSchedule(event.target.value as (typeof SCHEDULES)[number])}>
                {SCHEDULES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            ) : (
              <label className="mt-3 block text-sm">
                执行日期
                <input type="date" aria-label="执行日期" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={onceDate} onChange={(event) => setOnceDate(event.target.value)} />
              </label>
            )}
            {scheduleMode === "周期任务" && (schedule === "每周" || schedule === "双周") ? (
              <div className="mt-3 text-sm">
                <p>选择星期</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button key={day} type="button" aria-pressed={weekdays.includes(day)} className={cn("rounded-full px-3 py-1", weekdays.includes(day) && "bg-[#ececee] font-medium")} onClick={() => setWeekdays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]))}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {scheduleMode === "周期任务" && schedule === "每月" ? (
              <div className="mt-3 text-sm">
                <p>选择日期</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <button key={day} type="button" aria-pressed={monthDays.includes(day)} className={cn("h-8 w-8 rounded-full", monthDays.includes(day) && "bg-[#ececee] font-medium")} onClick={() => setMonthDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]))}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {scheduleMode === "周期任务" && schedule === "每年" ? (
              <div className="mt-3 flex gap-2 text-sm">
                <label>
                  选择月份
                  <select aria-label="选择月份" className="mt-1 h-9 rounded-lg border border-[#e6e6e8] px-2" value={yearMonth} onChange={(event) => setYearMonth(event.target.value)}>
                    <option value="">选择月份</option>
                    {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  选择日期
                  <select aria-label="选择日期" className="mt-1 h-9 rounded-lg border border-[#e6e6e8] px-2" value={yearDay} onChange={(event) => setYearDay(event.target.value)}>
                    <option value="">选择日期</option>
                    {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            {scheduleMode === "周期任务" && schedule === "按小时" ? (
              <label className="mt-3 block text-sm">
                每隔
                <input aria-label="每隔" inputMode="numeric" className="mt-1 h-9 w-24 rounded-lg border border-[#e6e6e8] px-2" value={hourEvery} onChange={(event) => setHourEvery(event.target.value.replace(/\D/g, ""))} />
                <span className="ml-2">小时</span>
                <span className="ml-2 text-xs text-[#888]">小时执行1次</span>
              </label>
            ) : null}
            {scheduleMode === "周期任务" && schedule === "按间隔" ? (
              <label className="mt-3 block text-sm">
                间隔
                <select aria-label="执行间隔" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={interval} onChange={(event) => setIntervalValue(event.target.value as (typeof INTERVALS)[number])}>
                  {INTERVALS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="mt-3 block text-sm">
              执行时间
              <input type="time" aria-label="执行时间" className="mt-1 h-9 rounded-lg border border-[#e6e6e8] px-2" value={execTime} onChange={(event) => setExecTime(event.target.value)} />
              <p className="mt-1 text-xs text-[#888]">建议避开上午高峰时段，高峰期容易排队等待; 选择非高峰期执行更稳定</p>
            </label>
            <fieldset className="mt-3">
              <legend className="text-sm">连接器</legend>
              <p className="text-xs text-[#888]">选择本次定时任务运行时可调用的连接器</p>
              <div className="mt-2 space-y-1">
                {connectors.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(item.name)}
                      onChange={(event) => setPicked((current) => (event.target.checked ? [...current, item.name] : current.filter((entry) => entry !== item.name)))}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-3 block text-sm">
              专家
              <select aria-label="专家" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={expert} onChange={(event) => setExpert(event.target.value)}>
                <option>不使用专家</option>
                {agents.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <fieldset className="mt-3 text-sm">
              <legend>执行权限</legend>
              <p className="text-xs text-[#888]">控制任务运行时工具调用是否需要确认</p>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="automation-permission" className="mt-1" checked={permission === "需逐次确认"} onChange={() => setPermission("需逐次确认")} />
                <span>
                  需逐次确认
                  <span className="mt-1 block text-xs text-[#888]">每次工具调用都会暂停等待人工确认</span>
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="automation-permission" className="mt-1" checked={permission === "免确认执行"} onChange={() => setPermission("免确认执行")} />
                <span>
                  免确认执行
                  <span className="mt-1 block text-xs text-[#888]">所有工具自动运行，无需逐次确认（适合无人值守的定时任务）</span>
                </span>
              </label>
            </fieldset>
            {formError ? <p className="mt-3 text-sm text-[#c04545]">{formError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => { setOpen(false); setEditingId(null); }}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                {editingId ? "保存" : "创建"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">确认删除</p>
            <p className="mt-2 text-[#666]">确定要删除定时任务「{deleting.name}」吗？此操作无法撤销。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  setTasks((items) => items.filter((task) => task.id !== deleting.id));
                  setRecords((items) => items.map((item) => (item.name === deleting.name ? { ...item, deleted: true } : item)));
                  setToast("定时任务已删除");
                  setDeleteId(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {batchConfirm ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">删除选中的 {selected.length} 个任务？</p>
            <p className="mt-2 text-[#666]">此操作将永久删除选中的定时任务并停止其所有后续运行。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBatchConfirm(false)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  const names = new Set(tasks.filter((task) => selected.includes(task.id)).map((task) => task.name));
                  setTasks((items) => items.filter((task) => !selected.includes(task.id)));
                  setRecords((items) => items.map((item) => (names.has(item.name) ? { ...item, deleted: true } : item)));
                  setSelected([]);
                  setBatchConfirm(false);
                  setToast("定时任务已删除");
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm text-white">{toast}</p> : null}
    </Page>
  );
}

const DOC_TYPES = ["全部", "文档", "表格", "幻灯片", "PDF"] as const;
const MORE_DOC_TYPES = ["收集表", "思维导图", "流程图", "画板", "智能文档", "智能表"] as const;

export function LibraryPage() {
  const bases = useMind((s) => s.catalog.bases);
  const [query, setQuery] = useState("");
  const [searchBy, setSearchBy] = useState<"文档名" | "所有者">("文档名");
  const [kind, setKind] = useState("全部");
  const [moreTypes, setMoreTypes] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [place, setPlace] = useState("全部位置");
  const [owner, setOwner] = useState("全部");
  const [edited, setEdited] = useState("全部时间");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const docs = bases.flatMap((base) => base.docs.map((doc) => ({ ...doc, base: base.name, kind: "文档", ownerName: "经办人" }))).map((doc, index) => ({
    ...doc,
    editedAt: new Date(Date.now() - (index === 0 ? 2 : 40) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }));
  const needle = query.trim();
  const visible = docs.filter((doc) => {
    if (kind !== "全部" && doc.kind !== kind) return false;
    if (place !== "全部位置" && doc.base !== place) return false;
    if (owner === "他人所有") return false;
    if (owner === "我所有的" && doc.ownerName !== "经办人") return false;
    if (edited === "近7天" && Date.now() - new Date(doc.editedAt).getTime() > 7 * 24 * 60 * 60 * 1000) return false;
    if (edited === "近1个月" && Date.now() - new Date(doc.editedAt).getTime() > 30 * 24 * 60 * 60 * 1000) return false;
    if (edited === "起始时间 ~ 结束时间") {
      if (rangeStart && doc.editedAt < rangeStart) return false;
      if (rangeEnd && doc.editedAt > rangeEnd) return false;
    }
    if (!needle) return true;
    return searchBy === "文档名" ? doc.title.includes(needle) : doc.ownerName.includes(needle);
  });
  const opened = docs.find((doc) => doc.id === openId);
  const typeButtons = moreTypes ? (["全部", "文档", "表格", "幻灯片", "PDF", ...MORE_DOC_TYPES] as const) : DOC_TYPES;
  return (
    <Page title="资料库">
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        {typeButtons.map((item) => (
          <button key={item} className={cn("rounded-full px-3 py-1", kind === item && "bg-[#ececee] font-medium")} onClick={() => setKind(item)}>
            {item}
          </button>
        ))}
        <button type="button" className="rounded-full px-3 py-1 text-[#666]" onClick={() => setMoreTypes((open) => !open)}>
          {moreTypes ? "收起" : "更多"}
        </button>
        <button type="button" className={cn("rounded-full px-3 py-1", filtersOpen && "bg-[#ececee] font-medium")} onClick={() => setFiltersOpen((open) => !open)}>
          筛选
        </button>
      </div>
      {filtersOpen ? (
        <div className="mb-3 grid max-w-3xl gap-3 rounded-xl bg-white p-4 text-sm sm:grid-cols-3">
          <label>
            位置
            <select aria-label="位置" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={place} onChange={(event) => setPlace(event.target.value)}>
              <option>全部位置</option>
              {bases.map((base) => (
                <option key={base.id}>{base.name}</option>
              ))}
            </select>
          </label>
          <label>
            所有者
            <select aria-label="所有者" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option>全部</option>
              <option>我所有的</option>
              <option>他人所有</option>
            </select>
          </label>
          <label>
            修改时间
            <select aria-label="修改时间" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={edited} onChange={(event) => setEdited(event.target.value)}>
              <option>全部时间</option>
              <option>近7天</option>
              <option>近1个月</option>
              <option>起始时间 ~ 结束时间</option>
            </select>
            {edited === "起始时间 ~ 结束时间" ? (
              <span className="mt-2 flex gap-2">
                <input aria-label="起始时间" type="date" value={rangeStart} className="h-9 min-w-0 flex-1 rounded-lg border border-[#e6e6e8] px-2" onChange={(event) => setRangeStart(event.target.value)} />
                <input aria-label="结束时间" type="date" value={rangeEnd} className="h-9 min-w-0 flex-1 rounded-lg border border-[#e6e6e8] px-2" onChange={(event) => setRangeEnd(event.target.value)} />
              </span>
            ) : null}
          </label>
        </div>
      ) : null}
      <div className="mb-3 flex max-w-md items-center gap-2">
        <input
          value={query}
          aria-label="搜索文档"
          placeholder="搜索文档"
          className="h-9 min-w-0 flex-1 rounded-lg border border-[#e6e6e8] bg-white px-3 text-sm outline-none"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="text-xs text-[#888]">搜索</span>
      </div>
      {needle ? (
        <div className="mb-3 flex gap-2 text-sm">
          <button type="button" className={cn("rounded-full px-3 py-1", searchBy === "文档名" && "bg-[#ececee] font-medium")} onClick={() => setSearchBy("文档名")}>
            搜文档名
          </button>
          <button type="button" className={cn("rounded-full px-3 py-1", searchBy === "所有者" && "bg-[#ececee] font-medium")} onClick={() => setSearchBy("所有者")}>
            搜所有者
          </button>
        </div>
      ) : null}
      {needle || filtersOpen ? <p className="mb-2 text-xs text-[#888]">共 {visible.length} 条结果</p> : null}
      {visible.length === 0 ? (
        <div className="text-sm">
          <p className="font-medium">未找到相关文档</p>
          <p className="mt-1 text-[#888]">请尝试更换关键词或调整筛选条件</p>
        </div>
      ) : null}
      <ul className="grid max-w-3xl gap-2">
        {visible.map((doc) => (
          <li key={doc.id}>
            <button type="button" className="w-full rounded-xl border border-[#ececee] bg-white p-4 text-left" onClick={() => setOpenId(doc.id)}>
              <p className="text-sm font-medium">{doc.title}</p>
              <p className="mt-1 text-xs text-[#888]">{doc.base} · {doc.kind} · {doc.ownerName}</p>
            </button>
          </li>
        ))}
      </ul>
      {opened ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5" role="dialog" aria-label={opened.title}>
            <h2 className="text-base font-semibold">{opened.title}</h2>
            <p className="mt-1 text-xs text-[#888]">{opened.base}</p>
            <p className="mt-3 text-sm leading-6 text-[#333]">{opened.body}</p>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => setOpenId(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

type CloudEntry = { id: string; name: string; kind: "文件夹" | "文件"; favorite: boolean; folderId: string | null; matterId?: string };

export function FilesPage() {
  const bases = useMind((s) => s.catalog.bases);
  const matters = useMind((s) => s.matters);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"cloud" | "library">("cloud");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMenu, setUploadMenu] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<CloudEntry | null>(null);
  const [versionFor, setVersionFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const needle = query.trim();
  const visible = entries.filter((item) => item.folderId === currentFolder && (!needle || item.name.includes(needle)));
  const folders = entries.filter((item) => item.kind === "文件夹" && item.id !== moveId);
  const docs = bases.flatMap((base) => base.docs.map((doc) => ({ ...doc, base: base.name }))).filter((doc) => !needle || doc.title.includes(needle));
  const deleting = entries.find((item) => item.id === deleteId);

  return (
    <Page title="我的文件" subtitle="快捷查看任务成果，上传到云端网盘开启跨端同步。">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button className={cn("rounded-full px-3 py-1", tab === "cloud" && "bg-[#ececee] font-medium")} onClick={() => setTab("cloud")}>
          云端网盘
        </button>
        <button className={cn("rounded-full px-3 py-1", tab === "library" && "bg-[#ececee] font-medium")} onClick={() => setTab("library")}>
          我的资料库
        </button>
        {tab === "cloud" ? (
          <>
            <button type="button" className="ml-auto rounded-lg bg-white px-3 py-1.5" onClick={() => { setFolderName(""); setFolderOpen(true); }}>
              新建文件夹
            </button>
            <div className="relative">
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" aria-expanded={uploadMenu} onClick={() => setUploadMenu((open) => !open)}>
                上传文件
              </button>
              {uploadMenu ? (
                <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl bg-white p-1 text-sm shadow">
                  <p className="px-2 py-1 text-xs text-[#999]">上传到云端</p>
                  <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => { setUploadMenu(false); setUploadName(""); setUploadOpen(true); }}>
                    我的云端网盘
                  </button>
                  <button type="button" disabled aria-disabled="true" className="block w-full cursor-not-allowed rounded-lg px-2 py-1.5 text-left text-[#b0b0b0] disabled:cursor-not-allowed">
                    我的资料库 · 未接入
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <Search label="搜索文件" value={query} onValue={setQuery} />
      {tab === "cloud" && currentFolder ? (
        <button type="button" className="mb-3 text-sm text-[#666]" onClick={() => setCurrentFolder(null)}>
          全部文件
        </button>
      ) : null}
      {tab === "cloud" && visible.length === 0 ? <p className="text-sm text-[#888]">{needle ? "暂无文件" : "暂无云端文件"}</p> : null}
      {tab === "cloud" ? (
        <ul className="grid max-w-3xl gap-2">
          {visible.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm">
              <span className="text-xs text-[#999]">{item.kind}</span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.favorite ? <span className="text-xs text-[#888]">已收藏</span> : null}
              {item.kind === "文件夹" ? (
                <button type="button" className="text-[#666]" onClick={() => setCurrentFolder(item.id)}>
                  打开文件夹
                </button>
              ) : null}
              <button
                type="button"
                className="text-[#666]"
                onClick={() => {
                  const favorite = !item.favorite;
                  setEntries((current) => current.map((entry) => (entry.id === item.id ? { ...entry, favorite } : entry)));
                  setToast(favorite ? "已添加到收藏" : "已取消收藏");
                }}
              >
                {item.favorite ? "取消收藏" : "收藏"}
              </button>
              <button type="button" className="text-[#666]" onClick={() => setMoveId(item.id)}>
                移动到
              </button>
              <button
                type="button"
                className="text-[#666]"
                onClick={() => setToast(item.kind === "文件夹" ? "文件夹不支持直接下载" : `已开始下载「${item.name}」`)}
              >
                下载
              </button>
              {item.matterId ? (
                <button
                  type="button"
                  className="text-[#666]"
                  onClick={() => {
                    const matter = matters.find((candidate) => candidate.id === item.matterId);
                    if (matter?.state === "closed") {
                      setToast("任务已归档，无法查看");
                      return;
                    }
                    navigate(`/task/${item.matterId}?file=${encodeURIComponent(item.name)}`);
                  }}
                >
                  回到任务对话
                </button>
              ) : null}
              <button type="button" className="text-[#666]" onClick={() => setAddTaskFor(item)}>
                添加到任务
              </button>
              <button
                type="button"
                className="text-[#666]"
                onClick={() => {
                  setShareId(item.id);
                  setShareCopied(false);
                }}
              >
                分享给好友
              </button>
              {item.kind === "文件" ? (
                <button type="button" className="text-[#666]" onClick={() => setPreviewFor(item.id)}>
                  预览
                </button>
              ) : null}
              {item.kind === "文件" ? (
                <button type="button" className="text-[#666]" onClick={() => setVersionFor(item.id)}>
                  版本管理
                </button>
              ) : null}
              <button type="button" className="text-[#666]" onClick={() => { setRenameId(item.id); setRenameValue(item.name); }}>
                重命名
              </button>
              <button type="button" className="text-[#666]" onClick={() => setDeleteId(item.id)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {previewFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="预览区域">
            <p className="font-medium">{entries.find((item) => item.id === previewFor)?.name}</p>
            <p className="mt-3 text-[#666]">该文件类型暂不支持预览</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPreviewFor(null)}>关闭</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  const name = entries.find((item) => item.id === previewFor)?.name ?? "";
                  setToast(`已开始下载「${name}」`);
                }}
              >
                下载文件查看
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {versionFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="版本管理">
            <p className="font-medium">版本管理</p>
            <p className="mt-2 text-[#888]">暂无版本记录</p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setVersionFor(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
      {tab === "library" && docs.length === 0 ? <p className="text-sm text-[#888]">暂无文件</p> : null}
      {tab === "library" ? (
        <ul className="grid max-w-3xl gap-2 text-sm">
          {docs.map((doc) => (
            <li key={doc.id} className="rounded-xl bg-white px-4 py-3">
              <p className="font-medium">{doc.title}</p>
              <p className="mt-1 text-xs text-[#888]">{doc.base}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {folderOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const name = folderName.trim();
              if (!name || folderCreating) return;
              setFolderCreating(true);
              window.setTimeout(() => {
                setEntries((current) => [{ id: `folder-${Date.now()}`, name, kind: "文件夹", favorite: false, folderId: currentFolder }, ...current]);
                setFolderCreating(false);
                setFolderOpen(false);
                setToast("文件夹创建成功");
              }, 400);
            }}
          >
            <p className="font-medium">新建文件夹</p>
            <label className="mt-3 block text-sm">
              文件夹名称
              <input aria-label="文件夹名称" value={folderName} placeholder="请输入文件夹名称" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setFolderName(event.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setFolderOpen(false)} disabled={folderCreating}>取消</button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={folderCreating}>{folderCreating ? "创建中..." : "创建"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {uploadOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const name = uploadName.trim();
              if (!name || uploadBusy) return;
              setUploadBusy(true);
              window.setTimeout(() => {
                setEntries((current) => [{ id: `file-${Date.now()}`, name, kind: "文件", favorite: false, folderId: currentFolder }, ...current]);
                setUploadBusy(false);
                setUploadOpen(false);
                setToast(`「${name}」已上传到我的云端网盘`);
              }, 400);
            }}
          >
            <p className="font-medium">上传文件</p>
            <label className="mt-3 block text-sm">
              新名称
              <input aria-label="新名称" value={uploadName} className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setUploadName(event.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setUploadOpen(false)} disabled={uploadBusy}>取消</button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={uploadBusy}>{uploadBusy ? "等待中" : "上传文件"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {renameId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const name = renameValue.trim();
              if (!name || renameSaving) return;
              setRenameSaving(true);
              window.setTimeout(() => {
                setEntries((current) => current.map((item) => (item.id === renameId ? { ...item, name } : item)));
                setRenameSaving(false);
                setRenameId(null);
                setToast(`已重命名为「${name}」`);
              }, 400);
            }}
          >
            <p className="font-medium">重命名</p>
            <label className="mt-3 block text-sm">
              新名称
              <input aria-label="新名称" value={renameValue} className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setRenameValue(event.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setRenameId(null)} disabled={renameSaving}>取消</button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={renameSaving}>{renameSaving ? "重命名中..." : "保存"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">确认删除</p>
            <p className="mt-2 text-[#666]">确定删除该文件吗？删除后不可恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={deleteSaving} onClick={() => {
                if (deleteSaving) return;
                setDeleteSaving(true);
                const name = deleting.name;
                const idToRemove = deleting.id;
                window.setTimeout(() => {
                  setEntries((current) => {
                    const remove = new Set<string>();
                    const stack = [idToRemove];
                    while (stack.length > 0) {
                      const id = stack.pop();
                      if (!id || remove.has(id)) continue;
                      remove.add(id);
                      for (const item of current) {
                        if (item.folderId === id) stack.push(item.id);
                      }
                    }
                    return current.filter((item) => !remove.has(item.id));
                  });
                  if (currentFolder === idToRemove) setCurrentFolder(null);
                  setToast(`已删除「${name}」`);
                  setDeleteSaving(false);
                  setDeleteId(null);
                }, 400);
              }}>
                {deleteSaving ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {moveId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">移动到我的云端网盘</p>
            {moveBusy ? <p className="mt-2 text-[#666]">移动中...</p> : null}
            <div className="mt-3 space-y-1">
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f6f6f7]"
                onClick={() => {
                  if (moveBusy) return;
                  setMoveBusy(true);
                  window.setTimeout(() => {
                    setEntries((current) => current.map((item) => (item.id === moveId ? { ...item, folderId: null } : item)));
                    setToast("已移动到「全部文件」");
                    setMoveBusy(false);
                    setMoveId(null);
                  }, 400);
                }}
              >
                全部文件
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f6f6f7]"
                  onClick={() => {
                    if (moveBusy) return;
                    const targetName = folder.name;
                    const targetId = folder.id;
                    setMoveBusy(true);
                    window.setTimeout(() => {
                      setEntries((current) => current.map((item) => (item.id === moveId ? { ...item, folderId: targetId } : item)));
                      setToast(`已移动到「${targetName}」`);
                      setMoveBusy(false);
                      setMoveId(null);
                    }, 400);
                  }}
                >
                  {folder.name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setMoveId(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
      {addTaskFor ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">添加到任务</p>
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {matters.filter((item) => item.state !== "closed").length === 0 ? <p className="text-[#888]">暂无任务</p> : null}
              {matters
                .filter((item) => item.state !== "closed")
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f6f6f7]"
                    onClick={() => navigate(`/task/${item.id}?file=${encodeURIComponent(addTaskFor.name)}`)}
                  >
                    {item.title}
                  </button>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setAddTaskFor(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
      {shareId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">分享</p>
            <p className="mt-3 font-medium">公开访问</p>
            <p className="mt-1 text-[#888]">任何有此链接的人都能查看</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareId(null)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40"
                disabled={shareBusy}
                onClick={() => {
                  setShareBusy(true);
                  window.setTimeout(() => {
                    setShareBusy(false);
                    setShareCopied(true);
                  }, 400);
                }}
              >
                {shareBusy ? "获取链接中..." : shareCopied ? "已复制" : "立即分享"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm text-white">{toast}</p> : null}
    </Page>
  );
}

export function SimpleEmpty({ title, subtitle, empty }: { title: string; subtitle?: string; empty: string }) {
  return (
    <Page title={title} subtitle={subtitle}>
      <p className="text-sm text-[#888]">{empty}</p>
    </Page>
  );
}

const INTEREST_TAGS = ["效率工具", "办公协作", "项目管理", "数据分析", "职场技能", "AI 大模型", "产品设计", "行业趋势", "学习提升", "职业发展"] as const;

const INSPIRATION_SAMPLES = [
  {
    title: "每天最值得知道的变化，会被怎么样呈现给你",
    summary: "一条灵感不会只给你一段资讯摘要，而会把重点变化、为什么值得看，以及下一步能做什么整理成更适合行动的研究结果。",
  },
  {
    title: "第一次用 MindBuddy，这三件事帮你快速上手",
    summary: "从查资料、整理结构，到直接做成页面或文档，第一批样例先帮你建立它不只是聊天框的直觉。",
  },
  {
    title: "一个模糊想法，怎么被 MindBuddy 推进成可交付结果",
    summary: "从一句模糊需求开始，逐步补成结构化方向，再推进成原型、文档或其他交付物。重点是事情真的往前走。",
  },
] as const;

export function InspirationPage() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [featureOn, setFeatureOn] = useState(true);
  const [tags, setTags] = useState<string[]>(["AI 大模型"]);
  const [curation, setCuration] = useState("");
  return (
    <Page title="灵感" subtitle="每天为你整理值得看的灵感，在几分钟内帮你更快进入今天的状态。">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white" onClick={() => setSettingsOpen(true)}>
          调整偏好
        </button>
        {enabled && featureOn ? <span className="text-xs text-[#12b981]">今日灵感送达</span> : null}
        {enabled && !featureOn ? <span className="text-xs text-[#888]">灵感功能已关闭</span> : null}
      </div>
      {preparing ? (
        <div className="mb-6 max-w-xl rounded-xl bg-white p-4 text-sm">
          <p className="text-xs text-[#888]">灵感准备中</p>
          <p className="mt-2 font-medium">你的第一份灵感生成中</p>
          <p className="mt-1 text-[#666]">我会根据你选择的兴趣标签与方向，整理出适合你的灵感卡片。</p>
          <ol className="mt-3 space-y-1 text-[#444]">
            <li>理解偏好</li>
            <li>获取信息</li>
            <li>生成灵感</li>
          </ol>
        </div>
      ) : null}
      {!enabled && !preparing ? (
        <div className="mb-6 max-w-xl rounded-xl bg-white p-4 text-sm">
          <p className="font-medium">欢迎使用灵感</p>
          <p className="mt-1 text-[#666]">灵感会根据你的兴趣与进行中的任务，每日为你准备个性化的研究结果。</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
            onClick={() => {
              setPreparing(true);
              window.setTimeout(() => {
                setPreparing(false);
                setEnabled(true);
              }, 700);
            }}
          >
            启用灵感
          </button>
        </div>
      ) : null}
      {enabled && !featureOn ? <p className="mb-4 text-sm text-[#888]">你可以在&quot;调整偏好&quot;中重新开启</p> : null}
      <p className="mb-3 text-sm text-[#666]">{enabled ? "以下是示例灵感，帮你快速了解功能" : "灵感样例"}</p>
      <ul className="grid max-w-3xl gap-3">
        {INSPIRATION_SAMPLES.map((item) => (
          <li key={item.title} className="rounded-xl bg-white p-4 text-sm">
            <p className="font-medium">{item.title}</p>
            <p className="mt-2 text-[#666]">{item.summary}</p>
            <button
              type="button"
              className="mt-3 text-[#1a1a1a]"
              onClick={() => navigate(`/?prompt=${encodeURIComponent(item.title)}`)}
            >
              深入探索
            </button>
          </li>
        ))}
      </ul>
      {settingsOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-6">
          <form
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              setEnabled(true);
              setSettingsOpen(false);
            }}
          >
            <p className="text-base font-medium">优化策略</p>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={featureOn} onChange={(event) => setFeatureOn(event.target.checked)} />
              <span>
                <span className="font-medium">灵感功能</span>
                <span className="mt-1 block text-[#888]">开启后每日自动生成个性化灵感卡片</span>
              </span>
            </label>
            <p className="mt-4 text-sm font-medium">兴趣方向</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTEREST_TAGS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={cn("rounded-full px-3 py-1 text-sm", on ? "bg-[#1a1a1a] text-white" : "bg-[#f3f3f4]")}
                    onClick={() => setTags((current) => (on ? current.filter((item) => item !== tag) : [...current, tag]))}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-sm font-medium">自然语言描述</p>
            <p className="mt-1 text-xs text-[#888]">用自然语言告诉我你想了解什么</p>
            <textarea
              aria-label="自然语言描述"
              value={curation}
              placeholder='例如："每天推送 AI 大模型行业动态" 或 "每周一汇总最新融资事件"'
              className="mt-2 h-24 w-full rounded-lg border border-[#e6e6e8] p-3 text-sm"
              onChange={(event) => setCuration(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}

export function MailPage() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<"form" | "code" | "inbox">("form");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [openedNotice, setOpenedNotice] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [confirm, setConfirm] = useState<"stop" | "start" | null>(null);
  const [tab, setTab] = useState<"收信记录" | "发信记录">("收信记录");
  const [query, setQuery] = useState("");
  const [mails, setMails] = useState([
    { id: "mail-in", box: "收信记录" as const, when: "今天", subject: "供应商准入材料请确认", from: "合规", to: "经办人", unread: true, body: "草案已写好。提交审批前需要你确认这一次。" },
    { id: "mail-week", box: "收信记录" as const, when: "本周", subject: "起草供应商准入说明", from: "合规", to: "经办人", unread: false, body: "草案已写好。提交审批前需要你确认这一次。" },
    { id: "mail-last", box: "收信记录" as const, when: "上周", subject: "阅读并总结 MindBuddy 文章", from: "合规", to: "经办人", unread: false, body: "草案已写好。提交审批前需要你确认这一次。" },
    { id: "mail-old", box: "收信记录" as const, when: "更早", subject: "制作泡泡玛特品牌介绍幻灯片", from: "合规", to: "经办人", unread: false, body: "8 页大纲：品牌一句话、产品线、会员、门店。" },
    { id: "mail-out", box: "发信记录" as const, when: "昨天", subject: "泡泡玛特品牌介绍", from: "经办人", to: "合规", unread: false, body: "8 页大纲：品牌一句话、产品线、会员、门店。" },
  ]);
  const [openMailId, setOpenMailId] = useState<string | null>(null);
  const [deleteMailId, setDeleteMailId] = useState<string | null>(null);
  const needle = query.trim();
  const visibleMails = mails.filter((mail) => mail.box === tab && (!needle || mail.subject.includes(needle) || mail.from.includes(needle)));
  const openMail = mails.find((mail) => mail.id === openMailId);

  if (phase !== "inbox") {
    return (
      <Page title="智能体邮箱" subtitle="安全高效地使用 MindBuddy 收发邮件 • 由 Agent Mail 提供服务">
        {phase === "form" ? (
          <form
            className="max-w-lg rounded-xl bg-white p-5 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (!agreed) return;
              setPhase("code");
              setCodeError(null);
            }}
          >
            <p className="font-medium">开通 MindBuddy 智能体邮箱</p>
            <p className="mt-2 text-[#666]">智能体邮箱是为你的 MindBuddy 创建的邮箱。你可以在 MindBuddy 对话中接收或发送邮件。</p>
            <label className="mt-4 flex items-center gap-2">
              <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
              我已阅读并同意《Agent Mail 服务协议》
            </label>
            <button type="submit" disabled={!agreed} className="mt-4 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40">
              发送验证码
            </button>
          </form>
        ) : (
          <form
            className="max-w-lg rounded-xl bg-white p-5 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^\d{6}$/.test(code)) {
                setCodeError("验证码错误，请重新输入");
                return;
              }
              setCodeError(null);
              setActivating(true);
              window.setTimeout(() => {
                setActivating(false);
                setOpenedNotice("邮箱已开通：mindbuddy");
                setPhase("inbox");
              }, 400);
            }}
          >
            <p className="font-medium">开通 MindBuddy 智能体邮箱</p>
            <p className="mt-2 text-[#666]">验证码已发送至 经办人</p>
            <label className="mt-4 block">
              输入 6 位验证码
              <input
                aria-label="输入 6 位验证码"
                value={code}
                placeholder="输入 6 位验证码"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            {codeError ? <p className="mt-2 text-[#c2410c]">{codeError}</p> : null}
            <button type="submit" disabled={activating} className="mt-4 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40">
              {activating ? "开通中" : "确认开通"}
            </button>
          </form>
        )}
      </Page>
    );
  }

  return (
    <Page title="智能体邮箱" subtitle={active ? "运行中" : "已停用"}>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(["收信记录", "发信记录"] as const).map((item) => (
          <button key={item} type="button" className={cn("rounded-full px-3 py-1", tab === item && "bg-white font-medium")} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded-lg bg-[#1a1a1a] px-3 py-1 text-white"
          onClick={() => navigate(`/?prompt=${encodeURIComponent("请用智能体邮箱（Agent Mail）发送邮件：")}`)}
        >
          发邮件
        </button>
        <button type="button" className="rounded-lg bg-white px-3 py-1" onClick={() => setConfirm(active ? "stop" : "start")}>
          {active ? "停用" : "重新启用"}
        </button>
      </div>
      {openedNotice ? <p className="mb-3 text-sm text-[#666]">{openedNotice}</p> : null}
      {!active ? <p className="mb-3 text-sm text-[#888]">停用后将停止接收新邮件通知，已有邮件不受影响。</p> : null}
      <Search label="搜索邮件" value={query} onValue={setQuery} />
      {visibleMails.length === 0 ? <p className="text-sm text-[#888]">暂无匹配邮件</p> : null}
      {(["今天", "昨天", "本周", "上周", "更早"] as const).map((group) => {
        const rows = visibleMails.filter((mail) => mail.when === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="mb-4" aria-label="智能体邮箱记录">
            <p className="mb-2 text-xs text-[#999]">{group}（{rows.length}封）</p>
            <ul className="space-y-2">
              {rows.map((mail) => (
                <li key={mail.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm">
                  <button type="button" className="min-w-0 flex-1 text-left" aria-label={`查看邮件：${mail.subject}`} onClick={() => { setOpenMailId(mail.id); setMails((current) => current.map((item) => (item.id === mail.id ? { ...item, unread: false } : item))); }}>
                    <span className="font-medium">{mail.unread ? "[新邮件] " : ""}{mail.subject}</span>
                    <span className="mt-1 block text-xs text-[#888]">{mail.from}</span>
                  </button>
                  <button type="button" className="text-[#666]" onClick={() => navigate(`/?prompt=${encodeURIComponent(mail.subject)}`)}>添加到对话</button>
                  <button type="button" className="text-[#666]" onClick={() => setDeleteMailId(mail.id)}>删除</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {openMail ? (
        <div role="dialog" aria-label="邮件详情" className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-sm">
            <div className="flex items-center gap-2">
              <p className="font-medium">邮件详情</p>
              <button type="button" className="ml-auto" aria-label="关闭邮件详情" onClick={() => setOpenMailId(null)}>关闭邮件详情</button>
            </div>
            <p className="mt-3">发件人 {openMail.from}</p>
            <p className="mt-1">收件人 {openMail.to}</p>
            <p className="mt-3 font-medium">{openMail.subject}</p>
            <p className="mt-2 text-[#666]">{openMail.body}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => navigate(`/?prompt=${encodeURIComponent(openMail.subject)}`)}>添加邮件到对话</button>
              <button type="button" onClick={() => navigate(`/?prompt=${encodeURIComponent("请用智能体邮箱（Agent Mail）回复这封邮件")}`)}>回复</button>
              <button type="button" onClick={() => navigate(`/?prompt=${encodeURIComponent("请用智能体邮箱（Agent Mail）把这封邮件转发给")}`)}>转发</button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteMailId ? (
        <div role="dialog" aria-label="确认删除邮件？" className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">确认删除邮件？</p>
            <p className="mt-2 text-[#666]">将删除选中的 1 封邮件，此操作不可撤销。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteMailId(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => { setMails((current) => current.filter((mail) => mail.id !== deleteMailId)); setDeleteMailId(null); setOpenMailId(null); }}>删除</button>
            </div>
          </div>
        </div>
      ) : null}
      {confirm ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">{confirm === "stop" ? "确认停用智能体邮箱？" : "确认重新启用智能体邮箱？"}</p>
            <p className="mt-2 text-[#666]">
              {confirm === "stop" ? "停用后将停止接收新邮件通知，已有邮件不受影响。" : "重新启用后将恢复邮件接收和通知。"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  setActive(confirm === "start");
                  setOpenedNotice(confirm === "stop" ? "邮箱已停用：mindbuddy" : "智能体邮箱已重新启用");
                  setConfirm(null);
                }}
              >
                {confirm === "stop" ? "停用" : "重新启用"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

const TONE_STYLES = [
  ["默认", "不设定特定风格"],
  ["专业严谨", "清晰、准确、值得信赖"],
  ["亲和友善", "温暖、平易近人、鼓励支持"],
  ["直言不讳", "简明扼要、不废话、直击要点"],
  ["天马行空", "富有想象力、善用比喻类比"],
  ["高效务实", "最少文字、最大信息量"],
  ["毒舌吐槽", "犀利吐槽、但绝不伤人"],
  ["启发引导", "用提问引导思考、授人以渔"],
] as const;

function knownSection(value: string | null) {
  const items = SETTINGS_NAV.flatMap((group) => [...group.items]);
  return value && items.includes(value as (typeof items)[number]) ? value : "个人主页";
}

function AboutSection() {
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(params.get("check") === "1" ? "正在检查更新..." : null);
  useEffect(() => {
    if (params.get("check") === "1") setNotice("正在检查更新...");
  }, [params]);
  useEffect(() => {
    if (notice !== "正在检查更新...") return;
    const timer = window.setTimeout(() => setNotice("已是最新版本"), 700);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return (
    <div className="mt-6 max-w-lg space-y-3 text-sm">
      <p>关于 MindBuddy</p>
      <p className="text-[#666]">当前版本 5.6.2</p>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg bg-white px-3 py-2" onClick={() => setNotice("正在检查更新...")}>
          检查更新
        </button>
        <button type="button" className="rounded-lg bg-white px-3 py-2" onClick={() => setParams({ section: "获取帮助", feedback: "1" })}>
          填写反馈
        </button>
        <button type="button" className="rounded-lg bg-white px-3 py-2">
          查看文档
        </button>
      </div>
      {notice ? <p className="text-[#666]">{notice}</p> : null}
    </div>
  );
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

function ShortcutsPanel() {
  const rows = useSyncExternalStore(subscribeShortcuts, getShortcuts);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteCommand, setDeleteCommand] = useState<string | null>(null);
  const [resetCommand, setResetCommand] = useState<string | null>(null);
  const visible = rows.filter((row) => !query || row.command.includes(query) || row.category.includes(query));

  useEffect(() => {
    setShortcutCapture(recording !== null);
    if (!recording) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRecording(null);
        setDraft("");
        return;
      }
      const chord = chordFromEvent(event);
      if (chord === null) return;
      event.preventDefault();
      if (chord === "") {
        setNotice("请至少包含一个修饰键");
        return;
      }
      setDraft(chord);
      setNotice(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

  useEffect(() => () => setShortcutCapture(false), []);

  function confirmDraft() {
    if (!recording) return;
    const problem = shortcutProblem(recording, draft);
    if (problem) {
      setNotice(problem);
      return;
    }
    assignShortcut(recording, draft);
    setNotice("快捷键设置成功");
    setRecording(null);
    setDraft("");
  }

  return (
    <div className="mt-6 max-w-3xl text-sm">
      <input aria-label="搜索快捷键" placeholder="搜索快捷键" value={query} className="mb-3 h-9 w-full rounded-lg border border-[#e6e6e8] bg-white px-3" onChange={(event) => setQuery(event.target.value)} />
      <div className="mb-2 flex items-center gap-3 text-xs text-[#999]">
        <span>共 {visible.length} 条</span>
        <button type="button" className="ml-auto text-[#444]" onClick={() => setResetCommand("*")}>
          全部恢复默认
        </button>
      </div>
      {notice ? <p className="mb-2 text-[#444]">{notice}</p> : null}
      {visible.length === 0 ? <p className="text-[#888]">没有匹配的快捷键</p> : null}
      <div className="overflow-hidden rounded-xl bg-white">
        <div className="grid grid-cols-[7rem_1fr_8rem_auto] gap-2 border-b border-[#f0f0f1] px-4 py-2 text-xs text-[#999]">
          <span />
          <span>命令</span>
          <span>按键绑定</span>
          <span>操作</span>
        </div>
        <ul className="divide-y divide-[#f0f0f1]">
          {visible.map((row) => (
            <li key={row.command} className="grid grid-cols-[7rem_1fr_8rem_auto] items-center gap-2 px-4 py-2">
              <span className="text-xs text-[#999]">{row.category}</span>
              <span>{row.command}</span>
              {recording === row.command ? (
                <span className="flex items-center gap-1">
                  <span>{draft || "按下快捷键"}</span>
                  <button type="button" className="text-xs text-[#666]" onClick={() => { setRecording(null); setDraft(""); }}>
                    ESC 取消
                  </button>
                  <button type="button" onClick={confirmDraft}>
                    确认
                  </button>
                </span>
              ) : (
                <button type="button" aria-label={`${row.command} 点击设置快捷键`} className="text-left text-[#444]" onClick={() => { setRecording(row.command); setDraft(""); setNotice(null); }}>
                  {row.keys}
                </button>
              )}
              <span className="flex gap-2 text-xs text-[#666]">
                <button type="button" aria-label={`${row.command} 清除快捷键`} disabled={row.keys === "未指定"} onClick={() => assignShortcut(row.command, "未指定")}>
                  清除快捷键
                </button>
                <button type="button" aria-label={`${row.command} 删除快捷键`} onClick={() => setDeleteCommand(row.command)}>
                  删除快捷键
                </button>
                <button type="button" aria-label={`${row.command} 重置为默认`} onClick={() => setResetCommand(row.command)}>
                  重置为默认
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {deleteCommand ? (
        <div role="dialog" aria-label="确定要删除该快捷键吗？" className="mt-4 rounded-xl bg-white p-4">
          <p>确定要删除该快捷键吗？</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setDeleteCommand(null)}>取消</button>
            <button type="button" onClick={() => { assignShortcut(deleteCommand, "未指定"); setDeleteCommand(null); }}>删除</button>
          </div>
        </div>
      ) : null}
      {resetCommand ? (
        <div role="dialog" aria-label="确定要重置为默认快捷键吗？" className="mt-4 rounded-xl bg-white p-4">
          <p>确定要重置为默认快捷键吗？</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setResetCommand(null)}>取消</button>
            <button
              type="button"
              onClick={() => {
                if (resetCommand === "*") {
                  resetAllShortcuts();
                  setNotice("所有快捷键已恢复至初始态");
                } else {
                  resetShortcut(resetCommand);
                }
                setResetCommand(null);
              }}
            >
              重置为默认
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const MOCK_MEMORY = `用户偏好：
- 喜欢简洁的代码风格
- 偏好使用 TypeScript
- 习惯使用 React 函数组件
- 工作时间通常在上午 9 点到下午 6 点

技术栈：
- 前端：React, TypeScript, Less
- 后端：Node.js
- 工具：VS Code, Git`;

const IMPORT_PROMPT = `请帮我整理一份我的个人使用画像，用途是让我在不同 AI 工具之间保持一致的协作体验。请基于你当前能访问到的、与我相关的长期信息和本次会话上下文进行整理。在涉及我的指令和偏好时，请尽量保留我原本的表述方式，不要过度改写。

分类（按以下顺序输出）
指令：我明确要求遵循的规则，包括语气、格式、风格、"始终做 X"、"绝不做 Y" 以及对助手行为的纠正。仅整理可从长期记忆中明确识别并客观存在的规则，不临时新增、不强加、不脑补未明确提出的要求。

身份：姓名、年龄、所在地、教育背景、家庭、人际关系、语言能力和个人兴趣（仅包含我主动分享过的非敏感信息，不输出证件号、联系方式、账号等隐私数据）。

职业：当前和过往的职位、公司以及主要技能领域。

项目：我实际参与构建或投入精力的项目。每个项目一条。包含项目功能、当前状态以及关键决策。以项目名称或简短描述作为条目开头。

偏好：广泛适用的观点、品味和工作风格偏好。

格式
使用分类标题作为每个类别的节标题。每个类别内，每行一条记录，按日期从早到晚排列。每行格式：

[YYYY-MM-DD] - 条目内容

如果日期未知，使用 [unknown] 代替。

输出
将整个画像包裹在一个代码块中，方便我复制。
代码块之后，简要说明：这是否已覆盖你当前能整理出的全部相关信息；若还有未纳入的维度或你不确定的条目，请列出来，由我判断是否补充。`;

function MemoryPanel() {
  const [memoryOn, setMemoryOn] = useState(true);
  const [memory, setMemory] = useState(MOCK_MEMORY);
  const [dialog, setDialog] = useState<"manage" | "import" | "reset" | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [importText, setImportText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  function submitSuggestion() {
    const next = suggestion.trim();
    if (!next || busy) {
      if (busy) setNotice("已有记忆更新任务在处理中，请稍后再试");
      return;
    }
    setBusy(true);
    setNotice("提交中...");
    window.setTimeout(() => {
      setMemory((current) => (current ? `${current}\n- ${next}` : next));
      setSuggestion("");
      setNotice("已提交，记忆更新中…");
      window.setTimeout(() => {
        setBusy(false);
        setDialog(null);
        setNotice("记忆更新成功");
      }, 400);
    }, 400);
  }

  function submitImport() {
    const next = importText.trim();
    if (!next) {
      setNotice("请先粘贴要导入的内容");
      return;
    }
    if (next.length < 20) {
      setNotice("内容过短，请粘贴完整的记忆内容");
      return;
    }
    if (busy) {
      setNotice("已有记忆更新任务在处理中，请稍后再试");
      return;
    }
    setBusy(true);
    setNotice("导入中...");
    window.setTimeout(() => {
      setMemory(next);
      setImportText("");
      setDialog(null);
      setBusy(false);
      setNotice("记忆已成功导入！");
    }, 400);
  }

  return (
    <div className="mt-6 max-w-lg space-y-3 text-sm">
      <p className="text-[#666]">记忆让 MindBuddy 记住你的偏好和习惯，对话越多，它就越懂你。</p>
      <p className="text-xs text-[#999]">记忆内容遵循 MindBuddy 隐私政策，仅你本人可见。</p>
      {notice ? <p className="text-xs text-[#666]">{notice}</p> : null}
      <label className="flex items-start gap-3 rounded-xl bg-white p-4">
        <input type="checkbox" checked={memoryOn} onChange={(event) => setMemoryOn(event.target.checked)} />
        <span>
          <span className="font-medium">生成对话记忆</span>
          <span className="mt-1 block text-[#888]">允许 MindBuddy 从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。</span>
        </span>
      </label>
      <div className="rounded-xl bg-white p-4">
        <div className="flex items-center gap-2">
          <p className="font-medium">来自对话的记忆</p>
          {memory ? <span className="text-xs text-[#999]">刚刚从对话中更新</span> : null}
        </div>
        {memory ? <pre className="mt-3 whitespace-pre-wrap text-[#444]">{memory}</pre> : <p className="mt-2 text-[#888]">暂无记忆内容</p>}
        {!memory ? <p className="mt-1 text-xs text-[#999]">开启&quot;生成对话记忆&quot;后，系统将自动记录你的偏好。</p> : null}
        <div className="mt-3 flex flex-wrap gap-3 text-[#666]">
          <button type="button" onClick={() => setDialog("manage")}>查看和编辑记忆</button>
          {memory ? <button type="button" onClick={() => setDialog("reset")}>重置记忆</button> : null}
        </div>
      </div>
      <div className="flex items-center rounded-xl bg-white p-4">
        <span>
          <span className="font-medium">管理记忆</span>
          <span className="mt-1 block text-[#888]">每晚自动整理更新，可随时查看和编辑</span>
        </span>
        <button type="button" className="ml-auto rounded-lg border border-[#e6e6e8] px-3 py-1.5" onClick={() => setDialog("import")}>
          导入
        </button>
      </div>
      {dialog === "manage" ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5" role="dialog" aria-label="管理记忆">
            <p className="font-medium">管理记忆</p>
            <p className="mt-2 text-[#666]">这是 MindBuddy 记住的关于你的信息，该摘要每晚重新生成。</p>
            <p className="mt-4 font-medium">关于你的记忆</p>
            <p className="mt-2 text-xs text-[#999]">当前记忆</p>
            {memory ? <pre className="mt-2 whitespace-pre-wrap text-[#444]">{memory}</pre> : <p className="mt-2 text-[#888]">暂无记忆内容</p>}
            {!memory ? <p className="mt-1 text-xs text-[#999]">开启&quot;生成对话记忆&quot;后，系统将自动记录你的偏好。</p> : null}
            <label className="mt-4 block">
              <span className="font-medium">修改建议</span>
              <textarea
                aria-label="修改建议"
                placeholder={'添加或删除一条记忆，例如"以后都用中文回复"'}
                className="mt-2 h-24 w-full rounded-lg border border-[#e6e6e8] p-2"
                value={suggestion}
                onChange={(event) => setSuggestion(event.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={!suggestion.trim() || busy} onClick={submitSuggestion}>
                {busy ? "提交中..." : "提交建议"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog === "reset" ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="重置记忆">
            <p className="font-medium">重置记忆</p>
            <p className="mt-2 text-[#666]">此操作将清空当前全部记忆，该操作不可恢复。</p>
            <p className="mt-2 text-xs text-[#999]">若「生成对话记忆」处于开启状态，后续对话仍会生成新的记忆；如需彻底停用，请同时关闭记忆功能。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  setMemory("");
                  setDialog(null);
                  setNotice("记忆已重置");
                }}
              >
                重置记忆
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog === "import" ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5" role="dialog" aria-label="导入其他记忆">
            <p className="font-medium">导入其他记忆</p>
            <p className="mt-3 font-medium">复制以下提示词到其他AI对话中</p>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f6f6f7] p-3 text-xs text-[#444]">{IMPORT_PROMPT}</pre>
            <button
              type="button"
              className="mt-2 text-[#666]"
              onClick={() => {
                void navigator.clipboard.writeText(IMPORT_PROMPT).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "已复制" : "复制"}
            </button>
            <p className="mt-4 font-medium">将结果粘贴到下方，添加到MindBuddy记忆</p>
            <textarea
              aria-label="在此粘贴你的记忆"
              placeholder="在此粘贴你的记忆"
              className="mt-2 h-28 w-full rounded-lg border border-[#e6e6e8] p-2"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" disabled={busy} onClick={submitImport}>
                {busy ? "导入中..." : "导入"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isNetworkHost(raw: string) {
  const value = raw.trim();
  if (!value || /[\s/?#]/.test(value) || value.includes("://") || value.includes(":")) {
    if (/^\[[0-9a-f:]+\]$/i.test(value)) return true;
    return false;
  }
  if (value === "*" || value.toLowerCase() === "localhost") return true;
  if (/^\*\.[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every((part) => Number(part) <= 255);
  return false;
}

function networkOverlaps(host: string, rules: { host: string }[]) {
  const next = host.toLowerCase();
  return rules.some((rule) => {
    const current = rule.host.toLowerCase();
    if (current === next) return false;
    if (current === "*" || next === "*") return true;
    const covers = (pattern: string, name: string) => pattern.startsWith("*.") && (name === pattern.slice(2) || name.endsWith(pattern.slice(1)));
    return covers(current, next) || covers(next, current);
  });
}

function isProgramName(raw: string) {
  const value = raw.trim();
  return Boolean(value) && !/[\s/\\|&;<>$`(){}[\]!#*?'"]/.test(value);
}

type SandboxRule = { id: string; match: string; action: "允许" | "询问" | "禁止"; perms?: string[] };

function SettingsBody({ section }: { section: string }) {
  const navigate = useNavigate();
  const role = useMind((s) => s.role);
  const mcps = useMind((s) => s.catalog.mcps);
  const matters = useMind((s) => s.matters);
  const archived = matters.filter((item) => item.state === "closed");
  const [nickname, setNickname] = useState("经办人");
  const [editingName, setEditingName] = useState(false);
  const [promptDraft, setPromptDraft] = useState(() => getUiPrefs().customPrompt);
  const [promptNotice, setPromptNotice] = useState<string | null>(null);
  const [dataTab, setDataTab] = useState("分享的文件");
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const sharedFiles = useSyncExternalStore(subscribeShares, getSharedFiles);
  const sharedTasks = useSyncExternalStore(subscribeShares, getSharedTasks);
  const publishedApps = useSyncExternalStore(subscribePublishedApps, getPublishedApps);
  const [offlineId, setOfflineId] = useState<string | null>(null);
  const unarchiveMatter = useMind((s) => s.unarchiveMatter);
  const [appTab, setAppTab] = useState("第三方应用");
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const [feedbackParams] = useSearchParams();
  const [feedbackOpen, setFeedbackOpen] = useState(feedbackParams.get("feedback") === "1");
  useEffect(() => {
    if (feedbackParams.get("feedback") === "1") setFeedbackOpen(true);
  }, [feedbackParams]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [feedbackImages, setFeedbackImages] = useState<string[]>([]);
  const [feedbackLog, setFeedbackLog] = useState(false);
  const [feedbackAt, setFeedbackAt] = useState(0);
  const buddyApps = useSyncExternalStore(subscribeBuddyApps, getBuddyApps);
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  const disconnecting = buddyApps.find((item) => item.id === disconnectId);
  const [agentTeamsOn, setAgentTeamsOn] = useState(true);
  const [browserControlOn, setBrowserControlOn] = useState(true);
  const [disabledMcps, setDisabledMcps] = useState<string[]>([]);
  const [toolQuery, setToolQuery] = useState("");
  const [requiredTools, setRequiredTools] = useState(true);
  const [sensitiveOn, setSensitiveOn] = useState(true);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<{ id: string; time: string; content: string; category: string; decision: string }[]>([]);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCategory, setAuditCategory] = useState("全部类型");
  const [auditDecision, setAuditDecision] = useState("全部结果");
  const [auditTime, setAuditTime] = useState("全部时间");
  const [detectRules, setDetectRules] = useState<{ id: string; name: string; config: string }[]>([]);
  const [rulePanel, setRulePanel] = useState(false);
  const [ruleEditor, setRuleEditor] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleConfig, setRuleConfig] = useState("");
  const [ruleDetailId, setRuleDetailId] = useState<string | null>(null);
  const [ruleDeleteId, setRuleDeleteId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ id: string; name: string; plain: string }[]>([]);
  const [secretEditor, setSecretEditor] = useState(false);
  const [secretName, setSecretName] = useState("");
  const [secretPlain, setSecretPlain] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretDeleteId, setSecretDeleteId] = useState<string | null>(null);
  const [sandboxOn, setSandboxOn] = useState(true);
  const [sandboxPage, setSandboxPage] = useState<"network" | "command" | "file" | null>(null);
  const [netRules, setNetRules] = useState<SandboxRule[]>([]);
  const [cmdRules, setCmdRules] = useState<SandboxRule[]>([]);
  const [fileRules, setFileRules] = useState<SandboxRule[]>([]);
  const [maliciousOn, setMaliciousOn] = useState(true);
  const [httpRemote, setHttpRemote] = useState("询问");
  const [httpLocal, setHttpLocal] = useState("询问");
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleAction, setRuleAction] = useState<"允许" | "询问" | "禁止">("询问");
  const [filePerms, setFilePerms] = useState<string[]>(["读取"]);
  const [ruleDraftError, setRuleDraftError] = useState<string | null>(null);
  const [policyHint, setPolicyHint] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [blacklistDraft, setBlacklistDraft] = useState("");
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  if (section === "个人主页") {
    return (
      <div className="mt-6 max-w-lg space-y-4 text-sm">
        <p className="text-[#666]">当前身份：{role}</p>
        <div className="rounded-xl bg-white p-4">
          <p className="text-xs text-[#999]">昵称</p>
          {editingName ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (nickname.trim()) setEditingName(false);
              }}
            >
              <input aria-label="昵称" value={nickname} className="h-9 flex-1 rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setNickname(event.target.value)} />
              <button className="rounded-lg bg-[#1a1a1a] px-3 text-white" type="submit">
                修改昵称
              </button>
            </form>
          ) : (
            <div className="mt-2 flex items-center">
              <span>{nickname}</span>
              <button className="ml-auto text-[#666]" type="button" onClick={() => setEditingName(true)}>
                修改昵称
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section === "外观") {
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

  if (section === "通用") {
    const sizes: FontSize[] = ["小", "默认", "大"];
    const sounds: TipSound[] = ["灵动", "晴朗", "沉稳", "无音效"];
    return (
      <div className="mt-6 max-w-lg space-y-3 text-sm">
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">显示语言</p>
          <p className="mt-1 text-[#888]">设置应用程序界面的显示语言。</p>
          <p className="mt-2">简体中文</p>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">字体大小</p>
          <div className="mt-3 flex gap-2">
            {sizes.map((item) => (
              <button key={item} type="button" className={cn("rounded-full px-3 py-1", uiPrefs.fontSize === item && "bg-[#1a1a1a] text-white")} onClick={() => setUiPrefs({ fontSize: item })}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-white p-4">
          <input type="checkbox" checked={uiPrefs.compact} onChange={(event) => setUiPrefs({ compact: event.target.checked })} />
          <span>
            <span className="font-medium">简洁模式</span>
            <span className="mt-1 block text-[#888]">开启后将简化对话界面显示，隐藏部分装饰性元素。</span>
          </span>
        </label>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">桌面通知</p>
          <p className="mt-1 text-[#888]">任务完成或有新消息时，通过系统弹窗提醒你</p>
          <button type="button" className="mt-3 rounded-lg bg-[#f3f3f4] px-3 py-1" onClick={() => void Notification.requestPermission()}>
            去授权
          </button>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-white p-4">
          <input type="checkbox" checked={uiPrefs.clientNotice} onChange={(event) => setUiPrefs({ clientNotice: event.target.checked })} />
          <span>
            <span className="font-medium">客户端通知</span>
            <span className="mt-1 block text-[#888]">运营消息优先在应用内显示，应用切换到后台以后自动转桌面通知</span>
          </span>
        </label>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">通知提示音</p>
          <p className="mt-1 text-[#888]">收到桌面或应用内通知时播放的提示音</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sounds.map((item) => (
              <button key={item} type="button" className={cn("rounded-full px-3 py-1", uiPrefs.tipSound === item && "bg-[#1a1a1a] text-white")} onClick={() => setUiPrefs({ tipSound: item })}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">链接打开方式</p>
          <p className="mt-1 text-[#888]">设置 MindBuddy 对话中链接的默认打开策略。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["按需（默认）", "始终内置", "始终外部"] as LinkOpen[]).map((item) => (
              <button key={item} type="button" className={cn("rounded-full px-3 py-1", uiPrefs.linkOpen === item && "bg-[#1a1a1a] text-white")} onClick={() => setUiPrefs({ linkOpen: item })}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section === "快捷键") return <ShortcutsPanel />;

  if (section === "个性化") {
    return (
      <div className="mt-6 max-w-2xl space-y-4 text-sm">
        <div>
          <p className="font-medium">回复风格</p>
          <p className="mt-1 text-[#888]">选择 MindBuddy 回复的默认语气</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {TONE_STYLES.map(([name, hint]) => (
              <button key={name} type="button" className={cn("rounded-xl bg-white p-3 text-left", uiPrefs.tone === name && "ring-2 ring-[#1a1a1a]")} onClick={() => { setUiPrefs({ tone: name }); setPromptNotice("设置已保存"); }}>
                <p className="font-medium">{name}</p>
                <p className="mt-1 text-xs text-[#888]">{hint}</p>
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-white p-4">
          <input type="checkbox" checked={uiPrefs.welcome} onChange={(event) => { setUiPrefs({ welcome: event.target.checked }); setPromptNotice("设置已保存"); }} />
          <span>
            <span className="font-medium">加载欢迎语</span>
            <span className="mt-1 block text-[#888]">当对话加载较慢时，用一句问候陪你等待，不至于干等</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl bg-white p-4">
          <input type="checkbox" checked={uiPrefs.fileChanges} onChange={(event) => { setUiPrefs({ fileChanges: event.target.checked }); setPromptNotice("设置已保存"); }} />
          <span>
            <span className="font-medium">展示文件变更过程详情</span>
            <span className="mt-1 block text-[#888]">开启后将在模型输出过程中展示并加载文件变更的过程详情</span>
          </span>
        </label>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">自定义指令</p>
          <p className="mt-1 text-[#888]">给 MindBuddy 定几条规则，后续对所有任务都生效</p>
          <textarea aria-label="自定义指令" placeholder="例如：回答先给结论再展开..." className="mt-3 h-24 w-full rounded-lg border border-[#e6e6e8] p-3" value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
          <div className="mt-2 flex items-center justify-end gap-3">
            <p className="mr-auto text-xs text-[#999]">这些指令会应用于你的所有对话</p>
            <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={!promptDraft.trim()} onClick={() => { setUiPrefs({ customPrompt: promptDraft.trim() }); setPromptNotice("设置已保存"); }}>添加</button>
          </div>
          {promptNotice ? <p className="mt-2 text-[#444]">{promptNotice}</p> : null}
        </div>
      </div>
    );
  }

  if (section === "连接器") {
    return (
      <div className="mt-6 max-w-3xl">
        <p className="text-sm font-medium">连接器管理</p>
        <p className="mt-1 mb-4 text-sm text-[#666]">连接外部服务，扩展 AI 能力</p>
        <ConnectorBoard tools={mcps} />
      </div>
    );
  }

  if (section === "智能体") {
    return (
      <div className="mt-6 max-w-lg space-y-3 text-sm">
        <div className="rounded-xl bg-white p-4">
          <div className="flex items-center gap-3">
            <p className="font-medium">智能体团队管理</p>
            <button type="button" className="ml-auto text-[#666]" aria-label={`智能体团队管理 ${agentTeamsOn ? "已开启" : "已关闭"}`} onClick={() => setAgentTeamsOn((on) => !on)}>
              {agentTeamsOn ? "已开启" : "已关闭"}
            </button>
          </div>
          <p className="mt-1 text-[#888]">遇到复杂任务时自动组建多个智能体分工协作完成。禁用后所有任务将由单个智能体独立处理。专家团不受此设置的影响</p>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">浏览器操控</p>
          <div className="mt-3 flex items-center gap-3">
            <p>让 MindBuddy 控制内置浏览器。</p>
            <button type="button" className="ml-auto shrink-0 text-[#666]" aria-label={`浏览器操控 ${browserControlOn ? "已开启" : "已关闭"}`} onClick={() => setBrowserControlOn((on) => !on)}>
              {browserControlOn ? "已开启" : "已关闭"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (section === "记忆与进化") return <MemoryPanel />;

  if (section === "模型") return <ModelsPanel />;

  if (section === "应用管理") {
    return (
      <div className="mt-6 max-w-lg text-sm">
        <div className="mb-4 flex gap-2">
          {(["第三方应用", "MindBuddy 应用"] as const).map((item) => (
            <button key={item} type="button" className={cn("rounded-full px-3 py-1", appTab === item && "bg-white font-medium")} onClick={() => setAppTab(item)}>
              {item}
            </button>
          ))}
        </div>
        <p className="text-[#888]">{appTab === "第三方应用" ? "授权后，第三方应用将能读取你的信息，你可随时取消授权。" : "授权后，MindBuddy 应用将能读取你的信息，你可随时取消授权。"}</p>
        {appTab === "第三方应用" ? <p className="mt-4 text-[#888]">暂无已连接的第三方应用</p> : null}
        {appTab === "MindBuddy 应用" && buddyApps.length === 0 ? <p className="mt-4 text-[#888]">暂无已连接的 MindBuddy 应用</p> : null}
        {appTab === "MindBuddy 应用"
          ? buddyApps.map((app) => (
              <div key={app.id} className="mt-4 rounded-xl bg-white p-4">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{app.name}</p>
                  <span className="rounded-full bg-[#eef8f3] px-2 py-0.5 text-xs text-[#12b981]">已授权</span>
                </div>
                <p className="mt-2 text-[#666]">{app.description}</p>
                <button type="button" className="mt-3 text-[#666]" onClick={() => setDisconnectId(app.id)}>
                  撤销授权
                </button>
              </div>
            ))
          : null}
        {disconnecting ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5">
              <p className="font-medium">{`撤销「${disconnecting.name}」的授权？`}</p>
              <p className="mt-2 text-[#666]">撤销后，该应用将无法再访问你的 MindBuddy 数据，相关功能会随之停用。如需恢复，可重新添加并授权。</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setDisconnectId(null)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                  onClick={() => {
                    disconnectBuddyApp(disconnecting.id);
                    setDisconnectId(null);
                    setAppToast("已取消授权");
                  }}
                >
                  撤销授权
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {appToast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-white">{appToast}</p> : null}
      </div>
    );
  }

  if (section === "数据管理") {
    const tabs = ["分享的文件", "分享的任务", "归档的任务", "应用"] as const;
    return (
      <div className="mt-6 max-w-2xl text-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button key={item} type="button" className={cn("rounded-full px-3 py-1", dataTab === item && "bg-white font-medium")} onClick={() => setDataTab(item)}>
              {item}
            </button>
          ))}
        </div>
        {dataTab === "分享的文件" ? (
          sharedFiles.length === 0 ? (
            <p className="text-[#888]">暂无分享文件</p>
          ) : (
            <div>
            <p className="mb-2 font-medium">已分享的文件</p>
            <table className="w-full text-left">
              <thead className="text-xs text-[#888]">
                <tr>
                  <th className="py-2 font-normal">名称</th>
                  <th className="py-2 font-normal">任务</th>
                  <th className="py-2 font-normal">生成分享时间</th>
                  <th className="py-2 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {sharedFiles.map((file) => (
                  <tr key={file.id} className="border-t border-[#f0f0f1]">
                    <td className="py-2">{file.name}</td>
                    <td className="py-2">{file.taskTitle}</td>
                    <td className="py-2">{file.sharedAt}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="mr-3 text-[#666]"
                        onClick={() => {
                          void navigator.clipboard.writeText(file.link).then(
                            () => setShareNotice("链接已复制到剪贴板"),
                            () => setShareNotice("复制链接失败"),
                          );
                        }}
                      >
                        复制链接
                      </button>
                      <button
                        type="button"
                        className="text-[#666]"
                        onClick={() => {
                          cancelSharedFile(file.id);
                          setShareNotice("已取消分享");
                        }}
                      >
                        取消分享
                      </button>
                      <button type="button" className="ml-3 text-[#666]" onClick={() => refreshSharedFile(file.id)}>
                        更新内容
                      </button>
                      <button type="button" className="ml-3 text-[#666]" onClick={() => navigate("/library")}>
                        去资料库管理
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )
        ) : null}
        {dataTab === "分享的任务" ? (
          sharedTasks.length === 0 ? (
            <p className="text-[#888]">暂无分享任务</p>
          ) : (
            <div>
              <p className="mb-2 font-medium">已分享的任务</p>
              <table className="w-full text-left">
                <thead className="text-xs text-[#888]">
                  <tr>
                    <th className="py-2 font-normal">任务名称</th>
                    <th className="py-2 font-normal">分享时间</th>
                    <th className="py-2 font-normal">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedTasks.map((task) => (
                    <tr key={task.matterId} className="border-t border-[#f0f0f1]">
                      <td className="py-2">{task.title}</td>
                      <td className="py-2">{task.sharedAt}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="mr-3 text-[#666]"
                          onClick={() => {
                            void navigator.clipboard.writeText(task.link).then(
                              () => setShareNotice("链接已复制到剪贴板"),
                              () => setShareNotice("复制链接失败"),
                            );
                          }}
                        >
                          复制链接
                        </button>
                        <button type="button" className="mr-3 text-[#666]" onClick={() => navigate(`/task/${task.matterId}`)}>
                          查看任务
                        </button>
                        <button
                          type="button"
                          className="text-[#666]"
                          onClick={() => {
                            cancelSharedTask(task.matterId);
                            setShareNotice("已取消分享");
                          }}
                        >
                          取消分享
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {dataTab === "应用" ? (
          <div>
            <p className="font-medium">已发布的应用</p>
            {publishedApps.length === 0 ? <p className="mt-2 text-[#888]">暂无发布记录</p> : null}
            <ul className="mt-3 space-y-2">
              {publishedApps.map((app) => (
                <li key={app.id} className="rounded-xl bg-white px-4 py-3">
                  <p className="font-medium">{app.name}</p>
                  <p className="mt-1 text-xs text-[#888]">{`任务名称：${app.taskTitle}`}</p>
                  <p className="mt-1 text-xs text-[#888]">{`发布链接：${app.link}`}</p>
                  <p className="mt-1 text-xs text-[#888]">{`发布时间 ${app.publishedAt}`}</p>
                  <p className="mt-1 text-xs text-[#888]">{app.status === "已下线" ? "已取消发布" : app.status === "未发布" ? "未发布" : "已发布"}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="text-[#666]"
                      onClick={() => {
                        void navigator.clipboard.writeText(app.link).then(
                          () => setShareNotice("链接已复制"),
                          () => setShareNotice("复制失败"),
                        );
                      }}
                    >
                      复制发布链接
                    </button>
                    <button type="button" className="text-[#666]" onClick={() => navigate(`/task/${app.matterId}`)}>
                      前往最近任务
                    </button>
                    <button type="button" className="text-[#666]" disabled={app.status === "已下线"} onClick={() => setOfflineId(app.id)}>
                      取消发布
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {offlineId ? (
              <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
                <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="取消发布">
                  <p className="font-medium">取消发布</p>
                  <p className="mt-2 text-[#666]">{`确认取消发布「${publishedApps.find((item) => item.id === offlineId)?.name ?? ""}」？取消后，发布的链接将失效。`}</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setOfflineId(null)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                      onClick={() => {
                        unpublishApp(offlineId);
                        setOfflineId(null);
                        setShareNotice("已取消发布，公开链接已失效");
                      }}
                    >
                      确认取消发布
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {dataTab === "归档的任务" ? (
          archived.length === 0 ? (
            <p className="text-[#888]">暂无已归档任务</p>
          ) : (
            <ul className="space-y-2">
              {archived.map((matter) => (
                <li key={matter.id} className="flex items-center rounded-xl bg-white px-4 py-3">
                  <span>{matter.title}</span>
                  <button
                    type="button"
                    className="ml-auto text-[#666]"
                    onClick={() => {
                      unarchiveMatter(matter.id);
                      setShareNotice("任务已恢复");
                    }}
                  >
                    取消归档
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {shareNotice ? <p className="mt-3 text-[#444]">{shareNotice}</p> : null}
      </div>
    );
  }

  if (section === "安全中心") {
    const needle = toolQuery.trim();
    const visibleMcps = mcps.filter((tool) => !needle || tool.name.includes(needle));
    const record = (content: string, category: string) => {
      setSecurityNotice(content);
      setAuditRows((rows) => [{ id: `audit-${Date.now()}`, time: "刚刚", content, category, decision: "信息记录" }, ...rows]);
    };
    if (sandboxPage) {
      const pageTitle = sandboxPage === "network" ? "网络安全" : sandboxPage === "command" ? "命令安全" : "文件安全";
      const rules = sandboxPage === "network" ? netRules : sandboxPage === "command" ? cmdRules : fileRules;
      const setRules = sandboxPage === "network" ? setNetRules : sandboxPage === "command" ? setCmdRules : setFileRules;
      const auditCategory = sandboxPage === "network" ? "网络访问" : pageTitle;
      const dirty = sandboxPage === "network"
        ? netRules.length > 0 || httpRemote !== "询问" || httpLocal !== "询问" || !maliciousOn
        : sandboxPage === "command"
          ? cmdRules.length > 0 || blacklist.length > 0
          : fileRules.length > 0;
      const addRule = () => {
        const match = ruleDraft.trim();
        if (sandboxPage === "network" && !isNetworkHost(match)) {
          setRuleDraftError("请输入主机名、IP 地址、* 或 *.example.com；不支持 URL、端口、路径和局部通配符。");
          return;
        }
        if (!match) return;
        const same = rules.some((rule) => rule.id !== editingRuleId && rule.match.toLowerCase() === match.toLowerCase());
        if (same) {
          setRuleDraftError("已存在完全相同的匹配条件，不能重复添加。");
          return;
        }
        const next: SandboxRule = { id: editingRuleId ?? `rule-${Date.now()}`, match, action: ruleAction, perms: sandboxPage === "file" ? filePerms : undefined };
        setRules((current) => editingRuleId ? current.map((rule) => (rule.id === editingRuleId ? next : rule)) : [next, ...current]);
        setPolicyHint(sandboxPage === "network" && networkOverlaps(match, rules.filter((rule) => rule.id !== editingRuleId).map((rule) => ({ host: rule.match }))) ? "该条件可能与现有规则重叠，最终结果取决于排序。" : null);
        record(editingRuleId ? `已修改${pageTitle}规则` : `已新增${pageTitle}规则`, auditCategory);
        setRuleDraft("");
        setEditingRuleId(null);
        setRuleDraftError(null);
      };
      return (
        <div className="mt-6 max-w-lg space-y-3 text-sm">
          <button type="button" onClick={() => { setSandboxPage(null); setEditingRuleId(null); setRuleDraft(""); setRuleDraftError(null); }}>返回</button>
          <p className="font-medium">{pageTitle}</p>
          <p className="text-[#666]">{sandboxPage === "network" ? "按优先级控制 URL 和域名访问" : sandboxPage === "command" ? "按优先级控制命令前缀的放行或询问" : "按优先级控制文件路径的读取、写入和删除"}</p>
          {securityNotice ? <p className="text-[#444]">{securityNotice}</p> : null}
          {sandboxPage === "network" ? (
            <div className="space-y-3 rounded-xl bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">拦截恶意网站</span>
                <button type="button" className="ml-auto text-[#666]" aria-label={`拦截恶意网站 ${maliciousOn ? "已开启" : "已关闭"}`} onClick={() => { const next = !maliciousOn; setMaliciousOn(next); record(next ? "已开启拦截恶意网站" : "已关闭拦截恶意网站", "网络访问"); }}>{maliciousOn ? "已开启" : "已关闭"}</button>
              </div>
              <p className="text-[#888]">自动识别并拦截钓鱼、欺诈、挂马等恶意网站，保护访问安全</p>
              <p className="font-medium">HTTP 请求拦截</p>
              <p className="text-[#888]">HTTP 明文传输不加密，数据在网络中可能被窃听或篡改，存在信息泄露及其他安全风险</p>
              <label className="block">HTTP 远程链接
                <select aria-label="HTTP 远程链接" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={httpRemote} onChange={(event) => { setHttpRemote(event.target.value); record(`HTTP 请求拦截策略已更新（远程：${event.target.value}，本地：${httpLocal}）`, "网络访问"); }}>
                  {["拦截", "询问", "放行"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">HTTP 本地链接
                <select aria-label="HTTP 本地链接" className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={httpLocal} onChange={(event) => { setHttpLocal(event.target.value); record(`HTTP 请求拦截策略已更新（远程：${httpRemote}，本地：${event.target.value}）`, "网络访问"); }}>
                  {["拦截", "询问", "放行"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <p className="font-medium">生效说明</p>
              <p className="text-[#888]">保存后立即用于后续操作，已经开始的操作不受影响。</p>
            </div>
          ) : null}
          {sandboxPage === "command" ? (
            <div className="rounded-xl bg-white p-4">
              <p className="font-medium">命令安全说明</p>
              <p className="mt-1 text-[#888]">规则按优先级从上到下匹配；命中询问规则后需确认，命中允许规则后自动放行。</p>
              <p className="mt-3 font-medium">程序黑名单</p>
              <p className="mt-1 text-[#888]">配置禁止运行的高风险程序名单，命中即拦截，子程序同样会检查。请仅填写程序名称，不要包含路径或参数。</p>
              <div className="mt-2 flex gap-2">
                <input aria-label="程序黑名单" placeholder="例如：rm" className="h-9 min-w-0 flex-1 rounded-lg border border-[#e6e6e8] px-2" value={blacklistDraft} onChange={(event) => { setBlacklistDraft(event.target.value); setBlacklistError(null); }} />
                <button type="button" disabled={!blacklistDraft.trim()} onClick={() => {
                  const name = blacklistDraft.trim();
                  if (!isProgramName(name)) { setBlacklistError("请输入单个程序名称，不要包含路径、参数或 Shell 特殊符号，例如 rm 或 python3。"); return; }
                  if (blacklist.includes(name)) { setBlacklistError("该程序已在黑名单中。"); return; }
                  setBlacklist((current) => [name, ...current]);
                  setBlacklistDraft("");
                  record(`已新增${pageTitle}规则`, auditCategory);
                }}>添加</button>
              </div>
              {blacklistError ? <p className="mt-2 text-[#c04545]">{blacklistError}</p> : null}
              <ul className="mt-2 space-y-1">{blacklist.map((name) => <li key={name}>{name}</li>)}</ul>
            </div>
          ) : null}
          {sandboxPage === "file" ? (
            <div className="rounded-xl bg-white p-4">
              <p className="font-medium">文件安全说明</p>
              <p className="mt-1 text-[#888]">按路径分别配置读取、写入和删除权限；未命中规则时保持现有安全策略。</p>
            </div>
          ) : null}
          <div className="rounded-xl bg-white p-4">
            <p className="font-medium">{sandboxPage === "network" ? "网络规则" : sandboxPage === "command" ? "命令规则" : "安全规则"}</p>
            <p className="mt-1 text-[#888]">{sandboxPage === "network" ? "配置域名和命中后的访问动作" : sandboxPage === "command" ? "配置命令前缀和命中后的处理动作" : "配置文件路径和读取、写入、删除动作"}</p>
            <p className="mt-2 text-xs text-[#999]">规则按从上到下顺序匹配，命中第一条后停止；新规则默认添加到顶部。</p>
            <input aria-label={sandboxPage === "network" ? "网络规则" : sandboxPage === "command" ? "命令规则" : "安全规则"} placeholder={sandboxPage === "network" ? "例如：api.example.com" : sandboxPage === "command" ? "例如：git push" : "例如：~/.cache/myapp/"} className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={ruleDraft} onChange={(event) => { setRuleDraft(event.target.value); setRuleDraftError(null); }} />
            <label className="mt-2 block">{sandboxPage === "file" ? "新增规则权限" : "新增规则动作"}
              <select aria-label={sandboxPage === "file" ? "新增规则权限" : "新增规则动作"} className="mt-1 h-8 w-full rounded-lg border border-[#e6e6e8] px-2" value={ruleAction} onChange={(event) => setRuleAction(event.target.value as "允许" | "询问" | "禁止")}>
                {["允许", "询问", "禁止"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            {sandboxPage === "file" ? (
              <div className="mt-2 flex gap-3">
                {["读取", "写入", "删除"].map((perm) => (
                  <label key={perm}><input type="checkbox" checked={filePerms.includes(perm)} onChange={(event) => setFilePerms((current) => event.target.checked ? [...current, perm] : current.filter((item) => item !== perm))} /> {perm}</label>
                ))}
              </div>
            ) : null}
            {ruleDraftError ? <p className="mt-2 text-[#c04545]">{ruleDraftError}</p> : null}
            {policyHint ? <p className="mt-2 text-[#888]">{policyHint}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={!dirty} title={dirty ? undefined : "当前已是默认规则，无需重置"} onClick={() => setResetAsk(true)}>重置为默认</button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40" disabled={!ruleDraft.trim() || (sandboxPage === "file" && filePerms.length === 0)} onClick={addRule}>{editingRuleId ? "编辑规则" : "添加"}</button>
            </div>
            {rules.length === 0 ? <p className="mt-3 text-[#888]">暂无规则，未命中时保持现有安全策略</p> : null}
            <ul className="mt-3 space-y-2">
              {rules.map((rule) => (
                <li key={rule.id} draggable onDragStart={() => setDragId(rule.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                  if (!dragId || dragId === rule.id) return;
                  setRules((current) => {
                    const next = [...current];
                    const from = next.findIndex((item) => item.id === dragId);
                    const to = next.findIndex((item) => item.id === rule.id);
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    return next;
                  });
                  setDragId(null);
                  record(`已调整${pageTitle}规则优先级`, auditCategory);
                }} className="rounded-lg bg-[#f7f7f8] px-3 py-2" title="拖动调整优先级">
                  <p>{rule.match}</p>
                  <p className="mt-1 text-xs text-[#888]">{`用户 · ${rule.action}${rule.perms?.length ? ` · ${rule.perms.join("、")}` : ""}`}</p>
                  <div className="mt-2 flex gap-3 text-[#666]">
                    <button type="button" onClick={() => { setEditingRuleId(rule.id); setRuleDraft(rule.match); setRuleAction(rule.action); setFilePerms(rule.perms ?? ["读取"]); }}>编辑规则</button>
                    <button type="button" onClick={() => { setRules((current) => current.filter((item) => item.id !== rule.id)); record(`已删除${pageTitle}规则`, auditCategory); }}>删除规则</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {resetAsk ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
              <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label={`将${pageTitle}规则重置为默认？`}>
                <p className="font-medium">{`将${pageTitle}规则重置为默认？`}</p>
                <p className="mt-2 text-[#666]">{`重置后，你对${pageTitle}规则的所有自定义配置将被清除，并恢复为当前版本的预设规则。此操作无法撤销。`}</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setResetAsk(false)}>取消</button>
                  <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => {
                    if (sandboxPage === "network") { setNetRules([]); setHttpRemote("询问"); setHttpLocal("询问"); setMaliciousOn(true); }
                    if (sandboxPage === "command") { setCmdRules([]); setBlacklist([]); }
                    if (sandboxPage === "file") setFileRules([]);
                    setResetAsk(false);
                    setPolicyHint(null);
                    record(`已恢复${pageTitle}预设规则`, auditCategory);
                  }}>重置为默认</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="mt-6 max-w-lg space-y-3 text-sm">
        <p className="text-[#666]">统一管理工作空间内的进程安全、数据安全与系统授权</p>
        {securityNotice ? <p className="text-[#444]">{securityNotice}</p> : null}
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">智能体工具管控</p>
          <p className="mt-1 text-[#888]">控制智能体可调用的 Tool 和 MCP</p>
          <input aria-label="搜索" placeholder="搜索" value={toolQuery} className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3" onChange={(event) => setToolQuery(event.target.value)} />
          <ul className="mt-3 space-y-2">
            {visibleMcps.map((tool) => {
              const enabled = !disabledMcps.includes(tool.id);
              return (
                <li key={tool.id} className="flex items-center gap-3 rounded-lg bg-[#f7f7f8] px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{tool.name}</span>
                    <span className="mt-1 block text-xs text-[#888]">仅支持整体启用或关闭</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${tool.name} ${enabled ? "已开启" : "已关闭"}`}
                    className="text-[#666]"
                    onClick={() => setDisabledMcps((current) => (enabled ? [...current, tool.id] : current.filter((id) => id !== tool.id)))}
                  >
                    {enabled ? "已开启" : "已关闭"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-white p-4">
          <input
            type="checkbox"
            checked={requiredTools}
            onChange={(event) => {
              setRequiredTools(event.target.checked);
              if (!event.target.checked) setSecurityNotice("关闭必要工具可能导致智能体无法完成常规任务。");
            }}
          />
          <span>
            <span className="font-medium">必要工具管理</span>
            <span className="mt-1 block text-[#888]">配置智能体完成通用任务所依赖的工具</span>
          </span>
        </label>
        <div className="rounded-xl bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="font-medium">敏感保护</span>
            <button
              type="button"
              aria-label={`敏感保护 ${sensitiveOn ? "已开启" : "已关闭"}`}
              className="ml-auto text-[#666]"
              onClick={() => {
                const next = !sensitiveOn;
                setSensitiveOn(next);
                const content = next ? "敏感信息保护已开启" : "敏感信息保护已关闭";
                setSecurityNotice(content);
                setAuditRows((rows) => [
                  { id: `audit-${Date.now()}`, time: "刚刚", content, category: "敏感信息保护", decision: "信息记录" },
                  ...rows,
                ]);
              }}
            >
              {sensitiveOn ? "已开启" : "已关闭"}
            </button>
          </div>
          <p className="mt-1 text-[#888]">检测并拦截票据、密码等敏感信息的意外泄露</p>
          <button type="button" className="mt-3 text-[#666]" onClick={() => setRulePanel(true)}>
            敏感保护设置
          </button>
        </div>
        {rulePanel ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5" role="dialog" aria-label="敏感保护设置">
              <p className="font-medium">敏感保护设置</p>
              <div className="mt-4 flex items-center">
                <p className="font-medium">自动检测规则</p>
                <button
                  type="button"
                  className="ml-auto text-[#666]"
                  onClick={() => {
                    setRuleEditor("new");
                    setRuleName("");
                    setRuleConfig("");
                  }}
                >
                  添加检测规则
                </button>
              </div>
              {detectRules.length === 0 ? <p className="mt-3 text-[#888]">暂无检测规则</p> : null}
              <ul className="mt-3 space-y-2">
                {detectRules.map((rule) => (
                  <li key={rule.id} className="rounded-lg bg-[#f7f7f8] px-3 py-2">
                    <p className="font-medium">{rule.name}</p>
                    <p className="mt-1 text-xs text-[#888]">自定义规则 · 不支持加密</p>
                    <div className="mt-2 flex gap-3 text-[#666]">
                      <button type="button" onClick={() => setRuleDetailId(rule.id)}>规则详情</button>
                      <button
                        type="button"
                        onClick={() => {
                          setRuleEditor(rule.id);
                          setRuleName(rule.name);
                          setRuleConfig(rule.config);
                        }}
                      >
                        编辑规则
                      </button>
                      <button type="button" onClick={() => setRuleDeleteId(rule.id)}>删除规则</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-[#f0f0f1] pt-4">
                <div className="flex items-center">
                  <p className="font-medium">敏感数据管理</p>
                  <button
                    type="button"
                    className="ml-auto text-[#666]"
                    onClick={() => {
                      setSecretEditor(true);
                      setSecretName("");
                      setSecretPlain("");
                      setSecretError(null);
                    }}
                  >
                    添加敏感数据
                  </button>
                </div>
                <p className="mt-1 text-[#888]">管理敏感数据，支持生成受管密文或仅参与敏感信息检测</p>
                <p className="mt-2 text-xs text-[#999]">添加的敏感数据会先匹配内置规则；命中可加密规则时生成密文，否则仅参与检测。</p>
                {secrets.length === 0 ? <p className="mt-3 text-[#888]">暂无敏感数据</p> : null}
                <ul className="mt-3 space-y-2">
                  {secrets.map((item) => (
                    <li key={item.id} className="rounded-lg bg-[#f7f7f8] px-3 py-2">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-[#888]">用户添加 · 检测状态 · 仅检测</p>
                      <button type="button" className="mt-2 text-[#666]" onClick={() => setSecretDeleteId(item.id)}>
                        删除敏感数据
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setRulePanel(false)}>取消</button>
              </div>
            </div>
          </div>
        ) : null}
        {secretEditor ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5" role="dialog" aria-label="添加敏感数据">
              <p className="font-medium">添加敏感数据</p>
              <label className="mt-3 block">
                <span>条目名称</span>
                <input aria-label="条目名称" placeholder="请输入" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={secretName} onChange={(event) => { setSecretName(event.target.value); setSecretError(null); }} />
              </label>
              <label className="mt-3 block">
                <span>明文</span>
                <textarea aria-label="明文" placeholder="请输入明文，如 API Key : sk-proj-abc123xyz" className="mt-1 h-24 w-full rounded-lg border border-[#e6e6e8] p-2" value={secretPlain} onChange={(event) => { setSecretPlain(event.target.value); setSecretError(null); }} />
              </label>
              {secretPlain.trim() ? (
                <div className="mt-3 rounded-lg bg-[#f7f7f8] p-3 text-xs text-[#666]">
                  <p>预览效果</p>
                  <p className="mt-2">{`帮我用 ${secretPlain.trim()} 调用接口`}</p>
                  <p className="mt-1">{`好的，我将帮你用 ${secretPlain.trim()} 调用接口...`}</p>
                  {secretPlain.trim().length >= 6 ? <p className="mt-2">明文未命中可加密的内置规则，仅参与检测，不生成或替换为密文</p> : null}
                </div>
              ) : null}
              {secretError ? <p className="mt-2 text-[#c04545]">{secretError}</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setSecretEditor(false)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40"
                  disabled={!secretName.trim() || !secretPlain.trim()}
                  onClick={() => {
                    const plain = secretPlain.trim();
                    if (plain.length < 6) {
                      setSecretError("明文长度不能少于 6 个字符");
                      return;
                    }
                    if (plain.length > 4096) {
                      setSecretError("明文长度不能超过 4096 个字符");
                      return;
                    }
                    setSecrets((current) => [...current, { id: `secret-${Date.now()}`, name: secretName.trim(), plain }]);
                    setSecretEditor(false);
                    setSecurityNotice("明文未命中可加密的内置规则，仅参与检测，不生成或替换为密文");
                  }}
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {secretDeleteId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="删除该敏感数据?">
              <p className="font-medium">删除该敏感数据?</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setSecretDeleteId(null)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                  onClick={() => {
                    setSecrets((current) => current.filter((item) => item.id !== secretDeleteId));
                    setSecretDeleteId(null);
                    setSecurityNotice("敏感数据删除成功");
                  }}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {ruleEditor ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5" role="dialog" aria-label={ruleEditor === "new" ? "添加检测规则" : "编辑检测规则"}>
              <p className="font-medium">{ruleEditor === "new" ? "添加检测规则" : "编辑检测规则"}</p>
              <label className="mt-3 block">
                <span>规则名称</span>
                <input aria-label="规则名称" placeholder="请输入" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={ruleName} onChange={(event) => setRuleName(event.target.value)} />
              </label>
              <label className="mt-3 block">
                <span>规则配置</span>
                <p className="mt-1 text-xs text-[#999]">{"必填，正则表达式，如：sk-[a-zA-Z0-9]{48}"}</p>
                <p className="text-xs text-[#999]">必填，规则名称，如：OpenAI API Key</p>
                <p className="text-xs text-[#999]">选填，加速匹配的关键词，如：sk-proj</p>
                <textarea aria-label="规则配置" placeholder="请输入完整的 TOML 规则块" className="mt-1 h-28 w-full rounded-lg border border-[#e6e6e8] p-2" value={ruleConfig} onChange={(event) => setRuleConfig(event.target.value)} />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRuleEditor(null)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white disabled:opacity-40"
                  disabled={!ruleName.trim() || !ruleConfig.trim()}
                  onClick={() => {
                    const name = ruleName.trim();
                    const config = ruleConfig.trim();
                    const creating = ruleEditor === "new";
                    setDetectRules((current) =>
                      creating ? [...current, { id: `rule-${Date.now()}`, name, config }] : current.map((rule) => (rule.id === ruleEditor ? { ...rule, name, config } : rule)),
                    );
                    const content = creating ? "检测规则添加成功" : "检测规则更新成功";
                    setSecurityNotice(content);
                    setAuditRows((rows) => [
                      {
                        id: `audit-${Date.now()}`,
                        time: "刚刚",
                        content: creating ? "已新增敏感信息保护规则" : "已修改敏感信息保护规则",
                        category: "敏感信息保护",
                        decision: "信息记录",
                      },
                      ...rows,
                    ]);
                    setRuleEditor(null);
                  }}
                >
                  {ruleEditor === "new" ? "添加检测规则" : "编辑规则"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {ruleDetailId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5" role="dialog" aria-label="规则详情">
              <p className="font-medium">规则详情</p>
              <p className="mt-3 text-xs text-[#999]">规则名称</p>
              <p>{detectRules.find((rule) => rule.id === ruleDetailId)?.name}</p>
              <p className="mt-3 text-xs text-[#999]">规则来源</p>
              <p>自定义规则</p>
              <p className="mt-3 text-xs text-[#999]">检测能力</p>
              <p className="text-[#888]">暂无能力信息</p>
              <p className="mt-3 text-xs text-[#999]">规则配置（TOML）</p>
              <pre className="mt-1 whitespace-pre-wrap text-[#444]">{detectRules.find((rule) => rule.id === ruleDetailId)?.config}</pre>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setRuleDetailId(null)}>取消</button>
              </div>
            </div>
          </div>
        ) : null}
        {ruleDeleteId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="删除该检测规则?">
              <p className="font-medium">删除该检测规则?</p>
              <p className="mt-2 text-[#666]">删除后将不再检测匹配该规则的敏感信息，已脱敏的数据不受影响。</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRuleDeleteId(null)}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                  onClick={() => {
                    setDetectRules((current) => current.filter((rule) => rule.id !== ruleDeleteId));
                    setRuleDeleteId(null);
                    setSecurityNotice("检测规则删除成功");
                    setAuditRows((rows) => [
                      { id: `audit-${Date.now()}`, time: "刚刚", content: "已删除敏感信息保护规则", category: "敏感信息保护", decision: "信息记录" },
                      ...rows,
                    ]);
                  }}
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="rounded-xl bg-white p-4">
          <div className="flex items-center gap-3">
            <p className="font-medium">沙箱安全</p>
            <button type="button" className="ml-auto text-[#666]" aria-label={`沙箱安全 ${sandboxOn ? "已开启" : "已关闭"}`} title={sandboxOn ? "保护您的数据，AI对受保护文件的修改和删除操作需要授权" : "您对自己的数据安全负责，不再阻止AI对文件的修改和删除"} onClick={() => { const next = !sandboxOn; setSandboxOn(next); record(next ? "沙箱安全已开启" : "沙箱安全已关闭", "沙箱运行"); }}>{sandboxOn ? "已开启" : "已关闭"}</button>
          </div>
          <p className="mt-1 text-[#888]">AI 运行于隔离沙箱，并配置文件、命令、网络访问策略</p>
          <p className="mt-2 text-xs text-[#666]">{sandboxOn ? "保护您的数据，AI对受保护文件的修改和删除操作需要授权" : "您对自己的数据安全负责，不再阻止AI对文件的修改和删除"}</p>
          <div className="mt-3 space-y-2">
            <button type="button" className="block w-full rounded-lg bg-[#f7f7f8] px-3 py-2 text-left" onClick={() => setSandboxPage("network")}>
              <span className="font-medium">网络安全</span>
              <span className="mt-1 block text-xs text-[#888]">按优先级控制 URL 和域名访问</span>
              <span className="mt-1 block text-xs text-[#888]">{`${netRules.filter((rule) => rule.action === "允许").length} 条允许，${netRules.filter((rule) => rule.action === "禁止").length} 条拒绝`}</span>
            </button>
            <button type="button" className="block w-full rounded-lg bg-[#f7f7f8] px-3 py-2 text-left" onClick={() => setSandboxPage("command")}>
              <span className="font-medium">命令安全</span>
              <span className="mt-1 block text-xs text-[#888]">按优先级控制命令前缀的放行或询问</span>
            </button>
            <button type="button" className="block w-full rounded-lg bg-[#f7f7f8] px-3 py-2 text-left" onClick={() => setSandboxPage("file")}>
              <span className="font-medium">文件安全</span>
              <span className="mt-1 block text-xs text-[#888]">按优先级控制文件路径的读取、写入和删除</span>
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="font-medium">数据安全</p>
          <p className="mt-1 text-[#888]">数据流转及删除行为的安全防护</p>
          <p className="mt-3 font-medium">安全网关</p>
          <p className="mt-1 text-[#888]">工作空间出入流量统一经过安全网关安全处理</p>
          <p className="mt-3 font-medium">传输加密</p>
          <p className="mt-1 text-[#888]">本地与云端通信使用端到端加密通道</p>
        </div>
        <div className="rounded-xl bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">审计中心</p>
            <span className="text-xs text-[#888]">{`日志 (${auditRows.length} 条)`}</span>
            <button type="button" className="ml-auto text-[#666]" onClick={() => setAuditRows([])}>
              清空记录
            </button>
            <button
              type="button"
              className="text-[#666]"
              onClick={() => {
                const body = auditRows.map((row) => `${row.time}\t${row.content}\t${row.category}\t${row.decision}`).join("\n");
                void navigator.clipboard.writeText(body).catch(() => setSecurityNotice("审计日志导出失败"));
              }}
            >
              导出日志
            </button>
          </div>
          <p className="mt-1 text-[#888]">拦截/放行记录与日志导出</p>
          <input
            aria-label="搜索日志内容、分类、命令或来源"
            placeholder="搜索日志内容、分类、命令或来源"
            value={auditQuery}
            className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
            onChange={(event) => setAuditQuery(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <select aria-label="全部类型" className="h-8 rounded-lg border border-[#e6e6e8] px-2" value={auditCategory} onChange={(event) => setAuditCategory(event.target.value)}>
              {["全部类型", "配置变更", "敏感信息保护", "MCP / 工具调用", "沙箱运行", "网络访问", "命令安全", "文件安全"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select aria-label="全部结果" className="h-8 rounded-lg border border-[#e6e6e8] px-2" value={auditDecision} onChange={(event) => setAuditDecision(event.target.value)}>
              {["全部结果", "已放行", "已拦截", "信息记录"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select aria-label="全部时间" className="h-8 rounded-lg border border-[#e6e6e8] px-2" value={auditTime} onChange={(event) => setAuditTime(event.target.value)}>
              {["全部时间", "今天", "近 7 天", "近 30 天"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              className="text-[#666]"
              onClick={() => {
                setAuditQuery("");
                setAuditCategory("全部类型");
                setAuditDecision("全部结果");
                setAuditTime("全部时间");
              }}
            >
              重置筛选
            </button>
          </div>
          {(() => {
            const needle = auditQuery.trim();
            const shown = auditRows.filter((row) => {
              const textOk = !needle || `${row.content} ${row.category} ${row.decision}`.includes(needle);
              const categoryOk = auditCategory === "全部类型" || row.category === auditCategory;
              const decisionOk = auditDecision === "全部结果" || row.decision === auditDecision;
              const timeOk = auditTime === "全部时间" || row.time === "刚刚";
              return textOk && categoryOk && decisionOk && timeOk;
            });
            return (
              <>
                <p className="mt-2 text-xs text-[#888]">{`已匹配：${shown.length} 条`}</p>
                {auditRows.length === 0 ? <p className="mt-3 text-[#888]">暂无拦截/放行记录</p> : null}
                {auditRows.length > 0 && shown.length === 0 ? <p className="mt-3 text-[#888]">没有符合条件的日志</p> : null}
                <ul className="mt-2 space-y-2">
                  {shown.map((row) => (
                    <li key={row.id} className="rounded-lg bg-[#f7f7f8] px-3 py-2">
                      <p>{row.content}</p>
                      <p className="mt-1 text-xs text-[#888]">{`时间 ${row.time} · ${row.category} · ${row.decision}`}</p>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  if (section === "关于") {
    return <AboutSection />;
  }

  if (section === "获取帮助") {
    return (
      <div className="mt-6 max-w-lg space-y-3 text-sm">
        <button type="button" className="block rounded-xl bg-white px-4 py-3 text-left">
          帮助文档
        </button>
        <button type="button" className="block rounded-xl bg-white px-4 py-3 text-left" onClick={() => setFeedbackOpen(true)}>
          意见反馈
        </button>
        {feedbackOpen ? (
          <form
            className="rounded-xl bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!feedbackText.trim()) return;
              if (feedbackAt && Date.now() - feedbackAt < 60_000) {
                setFeedbackNotice("提交过于频繁，请 1 分钟后再试");
                return;
              }
              setFeedbackNotice(feedbackLog ? "打包中..." : "正在提交...");
              window.setTimeout(() => {
                setFeedbackNotice("反馈提交成功，感谢您的反馈！");
                setFeedbackText("");
                setFeedbackImages([]);
                setFeedbackLog(false);
                setFeedbackOpen(false);
                setFeedbackAt(Date.now());
              }, 400);
            }}
          >
            <p className="font-medium">意见反馈</p>
            <textarea
              aria-label="意见反馈"
              value={feedbackText}
              placeholder="你可以描述你遇到的问题"
              className="mt-3 h-28 w-full rounded-lg border border-[#e6e6e8] p-3"
              onChange={(event) => setFeedbackText(event.target.value)}
            />
            <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-[#f3f3f4] px-3 py-1.5">
              上传图片
              <input
                aria-label="上传图片"
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,image/jpeg,image/png,image/gif,image/bmp,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (!/\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name)) {
                    setFeedbackNotice("仅支持 jpg/png/gif/bmp/webp 格式");
                    return;
                  }
                  if (file.size > 10 * 1024 * 1024) {
                    setFeedbackNotice("图片大小不能超过 10MB");
                    return;
                  }
                  setFeedbackImages((current) => [...current, file.name]);
                  setFeedbackNotice(null);
                }}
              />
            </label>
            {feedbackImages.length > 0 ? <p className="mt-2 text-xs text-[#666]">{feedbackImages.join("、")}</p> : null}
            <div className="mt-3 flex items-start gap-2 text-[#666]">
              <input aria-label="上传日志" type="checkbox" checked={feedbackLog} onChange={(event) => setFeedbackLog(event.target.checked)} />
              <span>
                上传日志，仅用于排查问题，可能包含对话记录、设备信息等数据。详情请查阅
                <button type="button" className="ml-1 text-[#1a1a1a] underline">隐私保护声明</button>
              </span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setFeedbackOpen(false)}>取消</button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white">提交</button>
            </div>
          </form>
        ) : null}
        {feedbackNotice ? <p className="text-[#666]">{feedbackNotice}</p> : null}
      </div>
    );
  }

  return null;
}

export function ArchivedPage() {
  const all = useMind((s) => s.matters);
  const unarchiveMatter = useMind((s) => s.unarchiveMatter);
  const [notice, setNotice] = useState<string | null>(null);
  const matters = all.filter((item) => item.state === "closed");
  return (
    <Page title="已归档任务">
      {matters.length === 0 ? <p className="text-sm text-[#888]">暂无已归档任务</p> : null}
      {notice ? <p className="mb-3 text-sm text-[#444]">{notice}</p> : null}
      <ul className="space-y-2">
        {matters.map((matter) => (
          <li key={matter.id} className="flex items-center rounded-lg bg-white px-3 py-2 text-sm">
            <span>{matter.title}</span>
            <button
              type="button"
              className="ml-auto text-[#666]"
              onClick={() => {
                unarchiveMatter(matter.id);
                setNotice("任务已恢复");
              }}
            >
              取消归档
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
