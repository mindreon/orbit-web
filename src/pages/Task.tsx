import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AgentQuestion } from "../components/tasks/AgentQuestion";
import { ApprovalInbox } from "../components/tasks/ApprovalInbox";
import { Composer } from "../components/tasks/Composer";
import { useConfigCatalog } from "../lib/configCatalog";
import { useTaskConfig } from "../lib/useTaskConfig";
import { TaskHeader } from "../components/tasks/TaskHeader";
import { OVERVIEW, TaskPanel } from "../components/tasks/TaskPanel";
import { Conversation } from "../components/conversation/Conversation";
import { describeFailure } from "../lib/api";
import { fileKey, flattenArtifacts, type ArtifactFile } from "../lib/artifacts";
import { approvalInfos } from "../lib/approvals";
import { buildTimeline } from "../lib/conversation";
import { controlTask, decideTaskApproval, sendTaskMessage } from "../lib/tasks";
import { useTasksStore } from "../lib/tasksStore";
import { useTaskStream } from "../lib/useTaskStream";
import { Alert } from "../ui/Alert";
import { Skeleton } from "../ui/Skeleton";

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
  const [panelOpen, setPanelOpen] = useState(true);
  const [openFiles, setOpenFiles] = useState<readonly ArtifactFile[]>([]);
  const [active, setActive] = useState(OVERVIEW);

  // 任务状态在服务端变化，侧栏里的这一条要跟着变。
  useEffect(() => {
    if (task) upsert(task);
  }, [task, upsert]);

  const files = useMemo(() => flattenArtifacts(artifacts), [artifacts]);
  const turns = useMemo(() => (task ? buildTimeline(task, events, live) : []), [task, events, live]);
  const approvals = useMemo(() => approvalInfos(events), [events]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    try {
      await run();
      setActionError(null);
    } catch (err) {
      setActionError(describeFailure("操作失败", err));
    }
  }, []);

  const openFile = useCallback((file: ArtifactFile) => {
    setOpenFiles((current) => (current.some((item) => fileKey(item) === fileKey(file)) ? current : [...current, file]));
    setActive(fileKey(file));
    setPanelOpen(true);
  }, []);

  const closeFile = useCallback((key: string) => {
    setOpenFiles((current) => current.filter((item) => fileKey(item) !== key));
    setActive((current) => (current === key ? OVERVIEW : current));
  }, []);

  const failure = actionError ?? error;
  const reconnecting = !failure && stream === "reconnecting";

  if (!task) {
    return (
      <main className="flex min-h-0 flex-1 flex-col bg-card p-6">
        {failure ? (
          <div className="mx-auto w-full max-w-xl space-y-4">
            <Alert>{failure}</Alert>
            <Link to="/" className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm hover:bg-secondary">
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
  const message = (text: string, delivery: "queue" | "interrupt") => act(() => sendTaskMessage(task.task_id, text, delivery));

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        <TaskHeader task={task} onCancel={() => void act(() => controlTask(task.task_id, "cancel"))} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />
        {failure ? <Alert className="mx-6 mt-3">{failure}</Alert> : null}
        {reconnecting ? <Alert tone="warning" className="mx-6 mt-3">实时事件连接已断开，正在重连…</Alert> : null}
        <Conversation
          turns={turns}
          profile={task.profile}
          files={files}
          onOpenFile={openFile}
          onOpenAllFiles={() => {
            setActive(OVERVIEW);
            setPanelOpen(true);
          }}
        >
          <ApprovalInbox approvals={task.pending_approvals ?? []} infos={approvals} onDecide={(id, decision, always) => void act(() => decideTaskApproval(task.task_id, id, decision, always))} />
          {live.question ? <AgentQuestion question={live.question} onAnswer={(text) => message(text, "queue")} /> : null}
          {task.status === "PAUSED" ? <p className="text-center text-xs text-muted-foreground">已停止，点击右下角的 ▶ 继续。</p> : null}
          {closed && turns.length > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              任务已取消。
              <Link to="/" className="ml-1 text-primary hover:underline">
                基于此开新任务
              </Link>
            </p>
          ) : null}
        </Conversation>
        <Composer onSend={message} onControl={(action) => void act(() => controlTask(task.task_id, action))} status={task.status} closed={closed} config={config} catalog={catalog} />
      </main>
      {panelOpen ? (
        <TaskPanel
          plan={plan}
          attempts={live.attempts}
          events={events}
          files={files}
          openFiles={openFiles}
          active={active}
          onActivate={setActive}
          onOpenFile={openFile}
          onCloseFile={closeFile}
          onCollapse={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

