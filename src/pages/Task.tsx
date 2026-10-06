import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AgentQuestion } from "../components/tasks/AgentQuestion";
import { ReviewNotice } from "../components/tasks/ReviewNotice";
import { TakeoverNotice } from "../components/tasks/TakeoverNotice";
import type { NodeActions } from "../components/tasks/NodeActions";
import { ApprovalInbox } from "../components/tasks/ApprovalInbox";
import { Composer } from "../components/tasks/Composer";
import { TaskStats } from "../components/tasks/TaskStats";
import { TodoChecklist } from "../components/tasks/TodoChecklist";
import { executionChecklist } from "../lib/todos";
import { useConfigCatalog } from "../lib/configCatalog";
import { useTaskConfig } from "../lib/useTaskConfig";
import { TaskHeader } from "../components/tasks/TaskHeader";
import { AGENTS, HOME, OVERVIEW, TaskPanel, type Overview } from "../components/tasks/TaskPanel";
import { Conversation } from "../components/conversation/Conversation";
import { GroupChat } from "../components/conversation/GroupChat";
import { buildChat, latestRosterStatus, mainChat, type ChatItem } from "../lib/chat";
import { describeFailure } from "../lib/api";
import { nodeRoles, nodeTitle, profileName, roleName } from "../lib/display";
import { BREAKPOINT, useMediaQuery } from "../lib/useMediaQuery";
import { fileKey, flattenArtifacts, type ArtifactFile } from "../lib/artifacts";
import { approvalInfos } from "../lib/approvals";
import { buildTimeline } from "../lib/conversation";
import { completeTaskNode, controlTask, decideTaskApproval, grantTaskBudget, sendTaskMessage, switchNodeProfile } from "../lib/tasks";
import { pendingSwitch, stageOfNode, totalReserved, type BudgetAmounts, type ProfileSwitch } from "../lib/taskEvents";
import { useTasksStore } from "../lib/tasksStore";
import { useTaskStream } from "../lib/useTaskStream";
import { cn } from "../lib/cn";
import { Alert } from "../ui/Alert";
import { Skeleton } from "../ui/Skeleton";

const PANEL_KEY = "orbit.taskPanel";

/** 这位用户上次收起还是展开了右侧面板；没记过（或存储不可用）就跟着屏幕宽度走：宽屏展开。 */
function readPanelPref(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "closed";
  } catch {
    return true;
  }
}

function writePanelPref(open: boolean) {
  try {
    localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
  } catch {
    // 存不进去就算了，本次会话内仍然生效。
  }
}

/** 路由入口：换任务时整页重建，右侧标签页之类的状态不会串到别的任务上。 */
export function TaskPage() {
  const { taskId = "" } = useParams();
  return <TaskView key={taskId} taskId={taskId} />;
}

function TaskView({ taskId }: { taskId: string }) {
  const { task, plan, artifacts, events, live, stream, error } = useTaskStream(taskId);
  const config = useTaskConfig(taskId);
  const catalog = useConfigCatalog();
  const upsert = useTasksStore((state) => state.upsert);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Wide screens open with the details column beside the conversation; narrower ones keep it as a drawer, closed until asked for.
  const wide = useMediaQuery(BREAKPOINT.lg);
  const [panelOpen, setPanelState] = useState(() => (window.matchMedia(BREAKPOINT.lg).matches ? readPanelPref() : false));
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelState(open);
    // 只记宽屏上的开合：窄屏的抽屉每次都从关着开始。
    if (window.matchMedia(BREAKPOINT.lg).matches) writePanelPref(open);
  }, []);
  // 面板打开时看哪一页：默认首页；「子智能体」里看哪位成员只有点名册才会打开，不跨任务记。
  const [overview, setOverview] = useState<Overview>(HOME);
  const [member, setMember] = useState<string | null>(null);
  // 最大化：面板占满整个任务页，对话藏起来（不卸载，输入框里的草稿还在）；只在宽屏上有，Esc 还原。
  const [maximized, setMaximized] = useState(false);
  const [openFiles, setOpenFiles] = useState<readonly ArtifactFile[]>([]);
  const [active, setActive] = useState(OVERVIEW);

  // 任务状态在服务端变化，侧栏里的这一条要跟着变。
  useEffect(() => {
    if (task) upsert(task);
  }, [task, upsert]);

  const files = useMemo(() => flattenArtifacts(artifacts), [artifacts]);
  const turns = useMemo(() => (task ? buildTimeline(task, events, live) : []), [task, events, live]);
  // 事件比任务快照先到：已有结果的审批立刻离开待确认；被取消的留一张说明。
  const pendingApprovals = (task?.pending_approvals ?? []).filter((id) => live.approvals[id] === undefined);
  const cancelledApprovals = Object.keys(live.approvals).filter((id) => live.approvals[id] === "CANCELLED");

  const nameOf = useCallback((ref: string) => profileName(ref, catalog.experts), [catalog.experts]);
  // Who each node belongs to (the leader, a member, the leader's review): the plan says which expert runs a node, the task's team says who that is.
  const team = config.team;
  const roles = useMemo(() => nodeRoles(team, plan?.nodes ?? []), [team, plan]);
  // An approval a member of a plan-level node raised has no role of its own: the node's owner is who asks.
  const approvals = useMemo(() => {
    const infos = approvalInfos(events);
    return Object.fromEntries(Object.entries(infos).map(([id, info]) => [id, info.role || !roles[info.nodeId] || roles[info.nodeId].kind !== "member" ? info : { ...info, role: roles[info.nodeId].role, roleLabel: roles[info.nodeId].label }]));
  }, [events, roles]);
  const roleNameOf = useCallback((role: string) => roleName(role, team?.members.find((member) => member.role === role)?.label, team?.leader), [team]);
  const stageNodeIds = useMemo(() => new Set((plan?.nodes ?? []).filter((node) => node.type === "team_stage").map((node) => node.node_id)), [plan]);
  const chat = useMemo<ChatItem[] | null>(() => (task && team ? buildChat({ task, events, live, team, nameOf, roles, stageNodeIds }) : null), [task, events, live, team, nameOf, roles, stageNodeIds]);
  // 执行清单：计划层的团队按成员的节点列，其余用领队（或单个智能体）最后一次 TodoWrite；成员的状态和名册同源。
  const rosterStatus = useMemo(() => (chat && team ? latestRosterStatus(mainChat(chat, team)) : new Map()), [chat, team]);
  const todos = useMemo(() => executionChecklist({ events, leader: team?.leader ?? "", nodes: plan?.nodes ?? [], roles, stageNodeIds, liveNodes: live.nodes, roster: rosterStatus }), [events, team, plan, roles, stageNodeIds, live.nodes, rosterStatus]);
  const showOverview = useCallback((next: Overview) => {
    setOverview(next);
    setActive(OVERVIEW);
    setPanelOpen(true);
  }, [setPanelOpen]);
  const showMember = useCallback((role: string) => {
    setMember(role);
    setActive(AGENTS);
    setPanelOpen(true);
  }, [setPanelOpen]);
  const stageOf = useCallback((nodeId: string) => stageOfNode(live, nodeId), [live]);
  const drawerOpen = panelOpen && !wide;
  const full = maximized && panelOpen && wide;
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMaximized(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPanelOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, setPanelOpen]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await run();
      setActionError(null);
    } catch (err) {
      setActionError(describeFailure("操作失败", err));
    }
  }, []);

  /** 弹窗和表单里的操作：失败时把原因还给它们，就地显示，不占页面顶部的提示。 */
  const attempt = useCallback(async (run: () => Promise<unknown>): Promise<string | null> => {
    try {
      await run();
      setActionError(null);
      return null;
    } catch (err) {
      return describeFailure("操作失败", err);
    }
  }, []);

  const openFile = useCallback((file: ArtifactFile) => {
    setOpenFiles((current) => (current.some((item) => fileKey(item) === fileKey(file)) ? current : [...current, file]));
    setActive(fileKey(file));
    setPanelOpen(true);
  }, [setPanelOpen]);

  const closeFile = useCallback((key: string) => {
    setOpenFiles((current) => current.filter((item) => fileKey(item) !== key));
    setActive((current) => (current === key ? OVERVIEW : current));
  }, []);

  const failure = actionError ?? error;
  const reconnecting = !failure && stream === "reconnecting";

  if (!task) {
    return (
      <main className="flex min-h-0 flex-1 flex-col bg-card p-4 sm:p-6">
        {failure ? (
          <div className="mx-auto w-full max-w-xl space-y-4">
            <Alert>{failure}</Alert>
            <Link to="/" className="inline-flex h-9 items-center rounded-control border border-border px-4 text-body hover:bg-secondary">
              回到新建任务
            </Link>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-40" />
          </div>
        )}
      </main>
    );
  }

  // 只有取消才结束任务；做完只是空闲，随时可以接着聊。
  const closed = task.status === "CANCELLED";
  const nodeTitles = Object.fromEntries((plan?.nodes ?? []).map((node) => [node.node_id, nodeTitle(node.title)]));
  const pendingSwitches: Record<string, ProfileSwitch> = {};
  for (const item of live.switches) {
    const pending = pendingSwitch(live, item.nodeId);
    if (pending) pendingSwitches[item.nodeId] = pending;
  }
  const nodeActions: NodeActions = {
    taskStatus: task.status,
    experts: catalog.experts,
    onComplete: (nodeId, reason) => attempt(() => completeTaskNode(task.task_id, nodeId, reason)),
    onSwitch: async (nodeId, toProfile, reason) => {
      try {
        const result = await switchNodeProfile(task.task_id, nodeId, toProfile, reason);
        setActionError(null);
        setNotice(
          result.needs_approval === true
            ? "已提交切换，等你批准后从下一次执行起生效。"
            : result.needs_approval === false
              ? "已切换，从下一次执行起生效。"
              : "已提交切换：如需你批准，审批卡会出现在对话里；生效后从下一次执行起使用新专家。",
        );
        return null;
      } catch (err) {
        return describeFailure("操作失败", err);
      }
    },
  };
  // 「需要你」的提示卡在场：审批、复核、接管、Agent 提问。
  const attention = pendingApprovals.length > 0 || task.status === "PAUSED_NEEDS_REVIEW" || task.status === "TAKEN_OVER" || Boolean(live.question);
  const grantBudget = (delta: BudgetAmounts) => attempt(() => grantTaskBudget(task.task_id, delta));
  const message = (text: string, delivery: "queue" | "interrupt", mentions: readonly string[] = []) => act(() => sendTaskMessage(task.task_id, text, delivery, mentions));

  return (
    <div className="flex min-h-0 flex-1">
      <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-card", full && "hidden")}>
        <TaskHeader task={task} onCancel={() => void act(() => controlTask(task.task_id, "cancel"))} onTakeover={() => void act(() => controlTask(task.task_id, "takeover"))} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />
        {failure ? <Alert className="mx-4 mt-3 sm:mx-6">{failure}</Alert> : null}
        {notice ? <Alert tone="info" className="mx-4 mt-3 sm:mx-6"><span data-testid="action-notice">{notice}</span></Alert> : null}
        {reconnecting ? <Alert tone="warning" className="mx-4 mt-3 sm:mx-6">实时事件连接已断开，正在重连…</Alert> : null}
        <Conversation
          turns={turns}
          expertName={nameOf(task.profile)}
          files={files}
          pendingApprovals={pendingApprovals}
          roles={roles}
          nameOf={nameOf}
          custom={chat && team ? { size: chat.reduce((sum, item) => sum + (item.type === "bubble" ? item.text.length + (item.work?.text.length ?? 0) + (item.work?.steps.length ?? 0) : item.type === "user" || item.type === "system" ? item.text.length : 1), chat.length), node: <GroupChat items={chat} team={team} files={files} onOpenFile={openFile} onOpenAllFiles={() => showOverview({ kind: "artifacts" })} onOpenMember={showMember} pendingApprovals={pendingApprovals} cancelledApprovals={cancelledApprovals} approvalInfos={approvals} nodeTitles={nodeTitles} nameOf={nameOf} roleNameOf={roleNameOf} onDecide={(id, decision, always) => void act(() => decideTaskApproval(task.task_id, id, decision, always))} /> } : undefined}
          onOpenFile={openFile}
          onOpenAllFiles={() => showOverview({ kind: "artifacts" })}
        >
          {chat ? null : <ApprovalInbox approvals={pendingApprovals} cancelled={cancelledApprovals} infos={approvals} nodeTitles={nodeTitles} nameOf={nameOf} roleNameOf={roleNameOf} onDecide={(id, decision, always) => void act(() => decideTaskApproval(task.task_id, id, decision, always))} />}
          {task.status === "PAUSED_NEEDS_REVIEW" ? <ReviewNotice review={live.review} onResume={() => void act(() => controlTask(task.task_id, "resume"))} onGrantBudget={grantBudget} /> : null}
          {task.status === "TAKEN_OVER" ? <TakeoverNotice onHandback={() => void act(() => controlTask(task.task_id, "handback"))} /> : null}
          {live.question ? <AgentQuestion key={`${live.question.attemptId}:${live.question.text}`} question={live.question} onAnswer={(text) => message(text, "queue")} /> : null}
          {task.status === "PAUSED" ? <p className="text-center text-small text-muted-foreground">已停止，点击右下角的 ▶ 继续。</p> : null}
          {closed && turns.length > 0 ? (
            <p className="text-center text-small text-muted-foreground">
              任务已取消。
              <Link to="/" className="ml-1 text-primary-700 hover:underline">
                基于此开新任务
              </Link>
            </p>
          ) : null}
        </Conversation>
        <TodoChecklist todos={todos ?? []} />
        <TaskStats usage={task.usage} budgets={task.budgets} />
        <Composer onSend={message} onControl={(action) => void act(() => controlTask(task.task_id, action))} status={task.status} closed={closed} attention={attention} config={config} catalog={catalog} team={team} />
      </main>
      {drawerOpen ? <div aria-hidden="true" data-testid="panel-backdrop" className="fixed inset-0 z-30 bg-black/40" onClick={() => setPanelOpen(false)} /> : null}
      {panelOpen ? (
        <TaskPanel
          plan={plan}
          nodes={live.nodes}
          task={task}
          reserved={totalReserved(live)}
          pendingSwitches={pendingSwitches}
          nodeActions={nodeActions}
          attempts={live.attempts}
          events={events}
          files={files}
          openFiles={openFiles}
          active={active}
          overview={overview}
          chat={chat}
          member={member}
          onMember={setMember}
          maximized={full}
          onToggleMaximize={() => setMaximized((value) => !value)}
          onOverview={showOverview}
          nameOf={nameOf}
          roles={roles}
          team={team}
          stageOf={stageOf}
          onActivate={setActive}
          onOpenFile={openFile}
          onCloseFile={closeFile}
          onCollapse={() => {
            setMaximized(false);
            setPanelOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

