import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AgentQuestion } from "../components/tasks/AgentQuestion";
import { ApprovalInbox } from "../components/tasks/ApprovalInbox";
import { Composer } from "../components/tasks/Composer";
import { TaskHeader } from "../components/tasks/TaskHeader";
import { OVERVIEW, TaskPanel } from "../components/tasks/TaskPanel";
import { Conversation } from "../components/conversation/Conversation";
import { describeFailure } from "../lib/api";
import { fileKey, flattenArtifacts, type ArtifactFile } from "../lib/artifacts";
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

  const closed = task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "FAILED";
  const message = (text: string, delivery: "queue" | "interrupt") => act(() => sendTaskMessage(task.task_id, text, delivery));

  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        <TaskHeader task={task} onControl={(action) => void act(() => controlTask(task.task_id, action))} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />
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
          <ApprovalInbox approvals={task.pending_approvals ?? []} onDecide={(id, decision) => void act(() => decideTaskApproval(task.task_id, id, decision))} />
          {live.question ? <AgentQuestion question={live.question} onAnswer={(text) => message(text, "queue")} /> : null}
          {closed && turns.length > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              任务已结束。
              <Link to="/" className="ml-1 text-primary hover:underline">
                基于此开新任务
              </Link>
            </p>
          ) : null}
        </Conversation>
        <Composer onSend={message} closed={closed} />
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

