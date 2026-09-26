import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router";
import { MORE_NAV, PRIMARY_NAV } from "./shell/nav";
import { getBuddyApps, subscribeBuddyApps } from "./lib/buddyApps";
import { chordFromEvent, getShortcuts, isShortcutCapture, subscribeShortcuts } from "./lib/shortcuts";
import { fontSizePx, getUiPrefs, stepFontSize, subscribeUiPrefs } from "./lib/uiPrefs";
import { HomePage } from "./pages/Home";
import { ShareTaskDialog } from "./pages/ShareTaskDialog";
import { WorkbenchPage } from "./pages/Workbench";
import {
  ArchivedPage,
  AssistantsPage,
  AutomationPage,
  ExpertsPage,
  FilesPage,
  InspirationPage,
  LibraryPage,
  MailPage,
  ProjectsPage,
  SettingsPage,
} from "./pages/Sections";
import { matterTitle, ROLES, type Role } from "./model";
import { useMind } from "./store";
import { cn } from "./lib/cn";

function matchesDate(createdAt: string, filter: string, range: { start: string; end: string }) {
  if (filter === "全部时间") return true;
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  if (filter === "今天") return then >= startMs;
  if (filter === "昨天") return then >= startMs - 86400000 && then < startMs;
  if (filter === "最近 7 天") return Date.now() - then <= 7 * 86400000;
  if (filter === "最近 30 天") return Date.now() - then <= 30 * 86400000;
  if (filter === "自定义范围" && range.start && range.end) {
    const from = new Date(range.start);
    from.setHours(0, 0, 0, 0);
    const to = new Date(range.end);
    to.setHours(23, 59, 59, 999);
    return then >= from.getTime() && then <= to.getTime();
  }
  return true;
}

type Notice = {
  id: string;
  title: string;
  body: string;
  time: string;
  pending: boolean;
  read: boolean;
  taskId: string;
};

const INITIAL_NOTICES: Notice[] = [
  {
    id: "notice-approval",
    title: "起草供应商准入说明",
    body: "这一件云端任务正在等待你确认。",
    time: "1 天前",
    pending: true,
    read: false,
    taskId: "mock-approval",
  },
  {
    id: "notice-summary",
    title: "阅读并总结 MindBuddy 文章",
    body: "任务已记下。产物留在这件云端任务里。",
    time: "13 天前",
    pending: false,
    read: false,
    taskId: "mock-summary",
  },
];

function ageLabel(createdAt: string) {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "刚刚";
  if (days < 30) return `${days}天前`;
  return createdAt.slice(0, 10);
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const loadRooms = useMind((s) => s.loadRooms);
  const matters = useMind((s) => s.matters);
  const selectMatter = useMind((s) => s.selectMatter);
  const startBlank = useMind((s) => s.startBlank);
  const role = useMind((s) => s.role);
  const setRole = useMind((s) => s.setRole);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuEdit, setMenuEdit] = useState(false);
  const [menuTip, setMenuTip] = useState("");
  const [primaryLabels, setPrimaryLabels] = useState<string[]>(PRIMARY_NAV.map((item) => item.label));
  const [moreLabels, setMoreLabels] = useState<string[]>(MORE_NAV.map((item) => item.label));
  const [appsOpen, setAppsOpen] = useState(false);
  const buddyApps = useSyncExternalStore(subscribeBuddyApps, getBuddyApps);
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  const shortcuts = useSyncExternalStore(subscribeShortcuts, getShortcuts);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [dateFilter, setDateFilter] = useState("全部时间");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [appliedRange, setAppliedRange] = useState({ start: "", end: "" });
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messageTab, setMessageTab] = useState<"全部" | "待处理">("全部");
  const [notices, setNotices] = useState(INITIAL_NOTICES);
  const [noticeLimit, setNoticeLimit] = useState(1);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  const renameMatter = useMind((s) => s.renameMatter);
  const archiveMatter = useMind((s) => s.archiveMatter);
  const removeMatter = useMind((s) => s.removeMatter);
  const pinMatter = useMind((s) => s.pinMatter);
  const [pinToast, setPinToast] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (location.pathname === "/") startBlank();
  }, [location.pathname, startBlank]);

  useEffect(() => {
    if (params.id) selectMatter(params.id);
  }, [params.id, selectMatter]);

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizePx(uiPrefs.fontSize);
    document.documentElement.dataset.compact = uiPrefs.compact ? "true" : "false";
    document.documentElement.dataset.theme = uiPrefs.theme === "深色" ? "dark" : "light";
  }, [uiPrefs]);

  const error = useMind((s) => s.error);
  const needle = query.trim();
  const openTasks = matters.filter((matter) => {
    if (searchOpen && needle && !matterTitle(matter).includes(needle)) return false;
    if (!matchesDate(matter.createdAt, dateFilter, appliedRange)) return false;
    if (statusFilter === "进行中") return matter.state === "running" || matter.state === "idle";
    if (statusFilter === "待处理") return matter.state === "awaiting_approval";
    if (statusFilter === "已归档") return matter.state === "closed";
    if (statusFilter === "已完成" || statusFilter === "失败" || statusFilter === "规划中") return false;
    return matter.state !== "closed";
  });
  const filtering = Boolean(needle) || statusFilter !== "全部状态" || dateFilter !== "全部时间";
  const pinnedTasks = openTasks.filter((matter) => matter.pinned);
  const otherTasks = openTasks.filter((matter) => !matter.pinned);

  useEffect(() => {
    if (!pinToast) return;
    const timer = window.setTimeout(() => setPinToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [pinToast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || isShortcutCapture()) return;
      const chord = chordFromEvent(event);
      if (!chord) return;
      const row = shortcuts.find((item) => item.keys === chord);
      if (!row) return;
      if (row.command === "打开设置") navigate("/settings");
      if (row.command === "新建对话") navigate("/");
      if (row.command === "切换左侧栏") setCollapsed((open) => !open);
      if (row.command === "切换右侧产物面板") window.dispatchEvent(new Event("mind-toggle-rail"));
      if (row.command === "唤起选择器") window.dispatchEvent(new Event("mind-open-mention"));
      if (row.command === "唤起斜杠命令") window.dispatchEvent(new Event("mind-open-slash"));
      if (row.command === "新建快速问答") navigate("/?quick=1");
      if (row.command === "发送消息") window.dispatchEvent(new Event("mind-send-message"));
      if (row.command === "输入时换行") window.dispatchEvent(new Event("mind-insert-newline"));
      if (row.command === "语音录制开关") window.dispatchEvent(new Event("mind-toggle-voice"));
      if (row.command === "上一个任务" || row.command === "下一个任务") {
        const index = openTasks.findIndex((item) => item.id === params.id);
        const next = index < 0 ? undefined : openTasks[index + (row.command === "上一个任务" ? -1 : 1)];
        if (next) {
          selectMatter(next.id);
          navigate(`/task/${next.id}`);
        }
      }
      if (row.command === "定位当前任务" && params.id) {
        document.querySelector(`[data-task-id="${params.id}"]`)?.scrollIntoView({ block: "nearest" });
      }
      if (row.command === "停止生成") {
        const state = useMind.getState();
        const matter = state.matters.find((item) => item.id === state.activeId);
        if (matter && (matter.state === "running" || state.pending === "send")) void state.stop();
      }
      if (row.command === "进入/退出全屏") {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }
      if (row.command === "放大内容字号") stepFontSize(1);
      if (row.command === "缩小内容字号") stepFontSize(-1);
      if (row.command === "重置内容字号") stepFontSize(0);
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, shortcuts, openTasks, params.id, selectMatter]);

  return (
    <div className="flex h-screen bg-[#f3f3f4] text-[#1a1a1a]">
      <aside className={cn("flex shrink-0 flex-col border-r border-[#e8e8ea] transition-[width]", collapsed ? "w-0 overflow-hidden border-r-0" : "w-[264px]")}>
        <div className="flex h-14 items-center gap-1 px-3">
          <button type="button" aria-label="收起侧边栏" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#e8e8ea]" onClick={() => setCollapsed(true)}>
            〈
          </button>
          <button type="button" aria-label="搜索" aria-pressed={searchOpen} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#e8e8ea]" onClick={() => setSearchOpen((open) => { if (open) setQuery(""); return !open; })}>
            ⌕
          </button>
          <div className="relative">
            <button type="button" aria-label="筛选" aria-expanded={filterOpen} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#e8e8ea]" onClick={() => setFilterOpen((open) => !open)}>
              ▽
            </button>
            {filterOpen ? (
              <div className="absolute left-0 z-20 mt-1 w-40 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
                <p className="px-2 py-1 text-xs text-[#999]">筛选状态</p>
                {["全部状态", "进行中", "已完成", "失败", "待处理", "规划中", "已归档"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn("block w-full rounded-lg px-2 py-1.5 text-left text-sm", statusFilter === item && "bg-[#f3f3f4]")}
                    onClick={() => setStatusFilter(item)}
                  >
                    {item}
                  </button>
                ))}
                <p className="mt-1 px-2 py-1 text-xs text-[#999]">筛选时间</p>
                {["全部时间", "今天", "昨天", "最近 7 天", "最近 30 天"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn("block w-full rounded-lg px-2 py-1.5 text-left text-sm", dateFilter === item && "bg-[#f3f3f4]")}
                    onClick={() => setDateFilter(item)}
                  >
                    {item}
                  </button>
                ))}
                <button
                  type="button"
                  className={cn("block w-full rounded-lg px-2 py-1.5 text-left text-sm", dateFilter === "自定义范围" && "bg-[#f3f3f4]")}
                  onClick={() => {
                    setFilterOpen(false);
                    setRangeOpen(true);
                  }}
                >
                  自定义范围...
                  {dateFilter === "自定义范围" && appliedRange.start && appliedRange.end ? (
                    <span className="mt-0.5 block text-xs text-[#888]">
                      {appliedRange.start} – {appliedRange.end}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="mt-1 block w-full rounded-lg px-2 py-1.5 text-left text-xs text-[#666] hover:bg-[#f6f6f7]"
                  onClick={() => {
                    setStatusFilter("全部状态");
                    setDateFilter("全部时间");
                    setAppliedRange({ start: "", end: "" });
                    setRangeStart("");
                    setRangeEnd("");
                  }}
                >
                  重置筛选条件
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-start justify-between px-4 pb-2">
          <div>
            <p className="text-sm font-semibold">MindBuddy</p>
          </div>
          <div className="relative">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-[#666] hover:bg-[#e8e8ea]"
              aria-expanded={appsOpen}
              onClick={() => setAppsOpen((open) => !open)}
            >
              发现应用
            </button>
            {appsOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[#ececee] bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-xs text-[#999]">最近使用</p>
                <p className="px-2 py-1 text-xs text-[#999]">MindBuddy 应用</p>
                {buddyApps.length === 0 ? <p className="px-2 py-2 text-sm text-[#888]">暂无已连接的 MindBuddy 应用</p> : null}
                {buddyApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                    onClick={() => {
                      setAppsOpen(false);
                      navigate("/settings?section=应用管理");
                    }}
                  >
                    {app.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                  onClick={() => {
                    setAppsOpen(false);
                    navigate("/settings?section=应用管理");
                  }}
                >
                  探索更多
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {searchOpen ? (
          <div className="px-3 pb-2">
            <input
              value={query}
              aria-label="搜索任务"
              placeholder="搜索任务"
              className="h-8 w-full rounded-lg border border-[#e6e6e8] bg-white px-2 text-sm outline-none"
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSearchIndex((index) => Math.min(index + 1, Math.max(openTasks.length - 1, 0)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSearchIndex((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Enter") {
                  const hit = openTasks[searchIndex];
                  if (!hit) return;
                  event.preventDefault();
                  selectMatter(hit.id);
                  navigate(`/task/${hit.id}`);
                  setQuery("");
                  setSearchOpen(false);
                }
                if (event.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                }
              }}
            />
            <p className="px-1 pt-2 text-xs text-[#888]">{needle ? `搜索到 ${openTasks.length} 个任务` : "最近任务"}</p>
            <p className="flex gap-3 px-1 pt-1 text-[10px] text-[#999]">
              <span>上下切换</span>
              <span>打开</span>
              <span>关闭</span>
            </p>
          </div>
        ) : null}
        <nav className="px-2" aria-label="Agents tabs">
          {primaryLabels.map((label) => {
            const item = [...PRIMARY_NAV, ...MORE_NAV].find((entry) => entry.label === label);
            if (!item) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn("mb-0.5 flex h-8 items-center rounded-lg px-3 text-sm", isActive ? "bg-[#e7e7e9] font-medium" : "hover:bg-[#ececee]")
                }
              >
                {item.label}
              </NavLink>
            );
          })}
          <div className="relative">
            <button
              type="button"
              aria-expanded={moreOpen}
              className={cn(
                "flex h-8 w-full items-center rounded-lg px-3 text-left text-sm",
                moreLabels.some((label) => [...PRIMARY_NAV, ...MORE_NAV].find((item) => item.label === label)?.to === location.pathname) ? "bg-[#e7e7e9] font-medium" : "hover:bg-[#ececee]",
              )}
              onClick={() => setMoreOpen((open) => !open)}
            >
              更多
            </button>
            {moreOpen ? (
              <div className="absolute left-2 z-20 mt-1 w-48 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
                {moreLabels.length === 0 ? <p className="px-3 py-2 text-xs text-[#888]">暂无内容，可将不常用的菜单功能移动到"更多"下</p> : null}
                {moreLabels.map((label) => {
                  const item = [...PRIMARY_NAV, ...MORE_NAV].find((entry) => entry.label === label);
                  if (!item) return null;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => cn("block rounded-lg px-3 py-2 text-sm", isActive ? "bg-[#f3f3f4]" : "hover:bg-[#f6f6f7]")}
                      onClick={() => setMoreOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  );
                })}
                <button
                  type="button"
                  className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                  onClick={() => {
                    setMoreOpen(false);
                    setMenuTip("");
                    setMenuEdit(true);
                  }}
                >
                  自定义菜单
                </button>
              </div>
            ) : null}
          </div>
        </nav>
        {menuEdit ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="自定义菜单栏">
              <p className="font-medium">自定义菜单栏</p>
              <p className="mt-1 text-xs text-[#888]">拖拽可替换位置</p>
              {menuTip ? <p className="mt-2 text-xs text-[#c04545]">{menuTip}</p> : null}
              {(["一级菜单", "更多"] as const).map((section) => {
                const labels = section === "一级菜单" ? primaryLabels : moreLabels;
                return (
                  <div
                    key={section}
                    className="mt-3 rounded-xl border border-dashed border-[#e6e6e8] p-2"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const label = event.dataTransfer.getData("text/plain");
                      if (!label || label === "新建任务") return;
                      const restPrimary = primaryLabels.filter((item) => item !== label);
                      const restMore = moreLabels.filter((item) => item !== label);
                      if (section === "一级菜单") {
                        setPrimaryLabels([...restPrimary, label]);
                        setMoreLabels(restMore);
                      } else {
                        setPrimaryLabels(restPrimary);
                        setMoreLabels([...restMore, label]);
                      }
                      setMenuTip("");
                    }}
                  >
                    <p className="px-2 py-1 text-xs text-[#888]">{section}</p>
                    {labels.length === 0 ? <p className="px-2 py-2 text-xs text-[#888]">暂无内容，可将不常用的菜单功能移动到"更多"下</p> : null}
                    {labels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        draggable
                        className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]"
                        onDragStart={(event) => {
                          if (label === "新建任务") {
                            event.preventDefault();
                            setMenuTip("新建任务菜单不支持拖拽替换位置");
                            return;
                          }
                          event.dataTransfer.setData("text/plain", label);
                          setMenuTip("");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setMenuEdit(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 min-h-0 flex-1 overflow-auto px-2 pb-2">
          <button type="button" className="flex w-full items-center px-3 py-1 text-xs text-[#888]" onClick={() => setTasksOpen((open) => !open)}>
            任务 ({openTasks.length})
          </button>
          {tasksOpen && error && openTasks.length === 0 && !filtering ? <p className="px-3 py-2 text-xs text-[#c04545]">{error}</p> : null}
          {tasksOpen && openTasks.length === 0 && filtering ? <p className="px-3 py-2 text-sm text-[#999]">没有匹配的任务</p> : null}
          {tasksOpen && openTasks.length === 0 && !filtering && !error ? (
            <div className="px-3 py-2">
              <p className="text-sm text-[#666]">暂无任务</p>
              <p className="mt-1 text-xs text-[#888]">点击上方按钮开始新任务</p>
            </div>
          ) : null}
          {tasksOpen && pinnedTasks.length > 0 ? <p className="px-3 pt-1 text-xs text-[#888]">置顶任务</p> : null}
          {tasksOpen
            ? [...pinnedTasks, ...otherTasks].map((matter) => (
                <div key={matter.id} data-task-id={matter.id} className={cn("relative flex items-center rounded-lg", params.id === matter.id && "bg-[#e7e7e9]", searchOpen && openTasks[searchIndex]?.id === matter.id && "ring-1 ring-[#1a1a1a]")}>
                  <button
                    className="block min-w-0 flex-1 px-3 py-2 text-left"
                    onClick={() => {
                      setMenuId(null);
                      selectMatter(matter.id);
                      navigate(`/task/${matter.id}`);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{matterTitle(matter)}</span>
                      {matter.pinned ? <span className="shrink-0 rounded bg-[#ececee] px-1.5 py-0.5 text-xs text-[#666]">已置顶</span> : null}
                      <span className="shrink-0 text-xs text-[#999]">{ageLabel(matter.createdAt)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${matterTitle(matter)} 更多`}
                    aria-expanded={menuId === matter.id}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#666] hover:bg-[#ececee]"
                    onClick={() => setMenuId((current) => (current === matter.id ? null : matter.id))}
                  >
                    ···
                  </button>
                  {menuId === matter.id ? (
                    <div className="absolute top-9 right-1 z-20 w-36 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                        onClick={() => {
                          const next = !matter.pinned;
                          pinMatter(matter.id, next);
                          setPinToast(next ? `已置顶「${matterTitle(matter)}」` : `已取消置顶「${matterTitle(matter)}」`);
                          setMenuId(null);
                        }}
                      >
                        {matter.pinned ? "取消置顶" : "置顶"}
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                        onClick={() => {
                          setRenameId(matter.id);
                          setRenameValue(matter.title);
                          setMenuId(null);
                        }}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                        onClick={() => {
                          setShareId(matter.id);
                          setMenuId(null);
                        }}
                      >
                        分享任务
                      </button>
                      <button
                        type="button"
                        disabled={matter.state === "running"}
                        title={matter.state === "running" ? "任务进行中，无法归档" : undefined}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7] disabled:opacity-40"
                        onClick={() => {
                          setArchiveId(matter.id);
                          setMenuId(null);
                        }}
                      >
                        归档任务
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                        onClick={() => {
                          setDeleteId(matter.id);
                          setMenuId(null);
                        }}
                      >
                        删除任务
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            : null}
          <button type="button" className="mt-2 flex w-full items-center px-3 py-1 text-xs text-[#888]" onClick={() => setSpacesOpen((open) => !open)}>
            空间 (0)
          </button>
          {spacesOpen ? <p className="px-3 py-2 text-sm text-[#999]">暂无任务</p> : null}
        </div>
        <div className="relative border-t border-[#e8e8ea] p-3">
          <div className="flex items-center gap-1">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[#ececee]" onClick={() => setAccountOpen((open) => !open)}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12b981] text-xs text-white">{role.slice(0, 1)}</span>
              <span className="truncate text-sm">{role}</span>
            </button>
            <button type="button" aria-label="消息中心" aria-expanded={messagesOpen} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666] hover:bg-[#ececee]" onClick={() => setMessagesOpen((open) => !open)}>
              ✉
            </button>
          </div>
          {messagesOpen ? (
            <div className="absolute bottom-16 left-3 z-20 w-80 rounded-xl border border-[#ececee] bg-white p-3 shadow-lg">
              <div className="flex items-center">
                <p className="text-sm font-medium">消息中心</p>
                <button
                  type="button"
                  className="ml-auto text-xs text-[#666]"
                  onClick={() => setNotices((items) => items.map((item) => ({ ...item, read: true })))}
                >
                  全部已读
                </button>
              </div>
              <div className="mt-2 flex gap-2 text-sm">
                {(["全部", "待处理"] as const).map((item) => (
                  <button key={item} type="button" className={cn("rounded-full px-2 py-0.5", messageTab === item && "bg-[#f3f3f4] font-medium")} onClick={() => setMessageTab(item)}>
                    {item}
                  </button>
                ))}
              </div>
              {notices.filter((item) => messageTab === "全部" || (item.pending && !item.read)).length === 0 ? (
                <p className="py-6 text-center text-sm text-[#888]">暂无消息</p>
              ) : (
                <ul className="mt-2 max-h-72 space-y-2 overflow-auto">
                  {notices
                    .filter((item) => messageTab === "全部" || (item.pending && !item.read))
                    .slice(0, noticeLimit)
                    .map((item) => (
                      <li key={item.id} className="rounded-lg border border-[#f0f0f1] px-3 py-2 text-sm">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-[#888]">
                          {item.time}
                          {item.read ? " · 已读" : ""}
                        </p>
                        {openNotice === item.id ? <p className="mt-2 text-[#444]">{item.body}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <button type="button" className="text-[#666]" onClick={() => setOpenNotice(openNotice === item.id ? null : item.id)}>
                            {openNotice === item.id ? "收起" : "展开"}
                          </button>
                          {openNotice === item.id ? (
                            <>
                              <button
                                type="button"
                                className="text-[#666]"
                                onClick={() => setNotices((items) => items.map((row) => (row.id === item.id ? { ...row, read: true } : row)))}
                              >
                                {item.read ? "已读" : "标为已读"}
                              </button>
                              <button
                                type="button"
                                className="text-[#666]"
                                onClick={() => {
                                  setMessagesOpen(false);
                                  navigate(`/task/${item.taskId}`);
                                }}
                              >
                                查看详情
                              </button>
                              <button type="button" className="text-[#c04545]" onClick={() => setNotices((items) => items.filter((row) => row.id !== item.id))}>
                                删除
                              </button>
                              <button
                                type="button"
                                className="text-[#666]"
                                onClick={() => {
                                  setNotices((items) => items.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
                                  setOpenNotice(null);
                                }}
                              >
                                我知道啦
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  {notices.filter((item) => messageTab === "全部" || (item.pending && !item.read)).length > noticeLimit ? (
                    <li>
                      <button type="button" className="text-sm text-[#666]" onClick={() => setNoticeLimit((count) => count + 1)}>
                        加载更多
                      </button>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          ) : null}
          {accountOpen ? (
            <div className="absolute bottom-16 left-3 z-20 w-52 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
              {ROLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                  onClick={() => setRole(item as Role)}
                >
                  {item}
                  {item === role ? " · 当前" : ""}
                </button>
              ))}
              <hr className="my-1 border-[#f0f0f1]" />
              <MenuLink label="企业智能体" to="/assistants?group=企业智能体" onDone={() => setAccountOpen(false)} />
              <MenuLink label="检查更新" to="/settings?section=关于&check=1" onDone={() => setAccountOpen(false)} />
              <MenuLink label="已归档任务" to="/archived" onDone={() => setAccountOpen(false)} />
              <MenuLink label="系统设置" to="/settings" onDone={() => setAccountOpen(false)} />
              <MenuLink label="记忆与进化" to="/settings?section=记忆与进化" onDone={() => setAccountOpen(false)} />
              <MenuLink label="个性化" to="/settings?section=个性化" onDone={() => setAccountOpen(false)} />
              <MenuLink label="外观" to="/settings?section=外观" onDone={() => setAccountOpen(false)} />
              <MenuLink label="数据管理" to="/settings?section=数据管理" onDone={() => setAccountOpen(false)} />
              <MenuLink label="帮助与反馈" to="/settings?section=获取帮助" onDone={() => setAccountOpen(false)} />
              <MenuLink label="账户管理" to="/settings?section=个人主页" onDone={() => setAccountOpen(false)} />
            </div>
          ) : null}
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">
        {collapsed ? (
          <button type="button" aria-label="展开侧边栏" className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#666] shadow" onClick={() => setCollapsed(false)}>
            〉
          </button>
        ) : null}
        {renderMain(location.pathname)}
      </main>
      {renameId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              renameMatter(renameId, renameValue);
              setRenameId(null);
            }}
          >
            <p className="font-medium">重命名任务</p>
            <p className="mt-2 text-xs text-[#888]">原名称：{matters.find((item) => item.id === renameId)?.title}</p>
            <input aria-label="任务名称" value={renameValue} className="mt-3 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm" onChange={(event) => setRenameValue(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setRenameId(null)}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {archiveId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">归档任务</p>
            <p className="mt-2 text-[#666]">确认将该任务归档吗？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveId(null)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  archiveMatter(archiveId);
                  if (params.id === archiveId) navigate("/");
                  setArchiveId(null);
                }}
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm">
            <p className="font-medium">删除任务</p>
            <p className="mt-2 text-[#666]">确认后将从列表中删除任务，请确认是否删除？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  removeMatter(deleteId);
                  if (params.id === deleteId) navigate("/");
                  setDeleteId(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {shareId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <ShareTaskDialog
            matterId={shareId}
            title={matters.find((item) => item.id === shareId)?.title ?? ""}
            onClose={() => setShareId(null)}
          />
        </div>
      ) : null}
      {rangeOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
              setAppliedRange({ start: rangeStart, end: rangeEnd });
              setDateFilter("自定义范围");
              setRangeOpen(false);
            }}
          >
            <h2 className="text-base font-semibold">自定义范围</h2>
            <label className="mt-3 block">
              开始日期
              <input
                aria-label="开始日期"
                type="date"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </label>
            <label className="mt-3 block">
              结束日期
              <input
                aria-label="结束日期"
                type="date"
                className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3"
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRangeOpen(false)}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}>
                确定
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {pinToast ? <p className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm text-white">{pinToast}</p> : null}
    </div>
  );
}

function MenuLink({ label, to, onDone }: { label: string; to: string; onDone: () => void }) {
  return (
    <NavLink to={to} className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f6f6f7]" onClick={onDone}>
      {label}
    </NavLink>
  );
}

function renderMain(pathname: string) {
  if (pathname === "/") return <HomePage />;
  if (pathname.startsWith("/task/")) return <WorkbenchPage />;
  if (pathname === "/assistants") return <AssistantsPage />;
  if (pathname === "/projects") return <ProjectsPage />;
  if (pathname === "/experts") return <ExpertsPage tab="experts" />;
  if (pathname === "/experts/skills") return <ExpertsPage tab="skills" />;
  if (pathname === "/experts/connectors") return <ExpertsPage tab="connectors" />;
  if (pathname === "/automation") return <AutomationPage />;
  if (pathname === "/library") return <LibraryPage />;
  if (pathname === "/files") return <FilesPage />;
  if (pathname === "/mail") return <MailPage />;
  if (pathname === "/inspiration") return <InspirationPage />;
  if (pathname === "/settings") return <SettingsPage />;
  if (pathname === "/archived") return <ArchivedPage />;
  return <HomePage />;
}
