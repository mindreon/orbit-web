import { ListChecks, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgentQuestion } from "../components/tasks/AgentQuestion";
import { ApprovalInbox } from "../components/tasks/ApprovalInbox";
import { Artifacts } from "../components/tasks/Artifacts";
import { AttemptTimeline } from "../components/tasks/AttemptTimeline";
import { Composer } from "../components/tasks/Composer";
import { EventLog } from "../components/tasks/EventLog";
import { LiveOutput } from "../components/tasks/LiveOutput";
import { PlanGraph } from "../components/tasks/PlanGraph";
import { NewTaskDialog } from "../components/tasks/NewTaskDialog";
import { TaskHeader } from "../components/tasks/TaskHeader";
import { TaskList } from "../components/tasks/TaskList";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { controlTask, createTask, decideTaskApproval, listTasks, sendTaskMessage, type Task } from "../lib/tasks";
import { describeFailure } from "../lib/api";
import { useTaskStream } from "../lib/useTaskStream";

export function TasksPage() {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { task, plan, artifacts, events, live, stream, error } = useTaskStream(selectedId);

  useEffect(() => {
    void listTasks()
      .then((items) => {
        setTasks(items);
        const newest = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        setSelectedId((current) => current ?? newest?.task_id ?? null);
      })
      .catch((err: unknown) => setActionError(describeFailure("读取任务失败", err)));
  }, []);

  // A task's status changes on the server; keep the list entry in step with the open task.
  useEffect(() => {
    if (task) setTasks((current) => current.map((item) => (item.task_id === task.task_id ? task : item)));
  }, [task]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    try { await run(); setActionError(null); } catch (err) { setActionError(describeFailure("操作失败", err)); }
  }, []);

  const create = async (input: { title: string; goal: string }) => {
    const created = await createTask(input);
    setTasks((current) => [created, ...current]);
    setSelectedId(created.task_id);
    setActionError(null);
  };

  const message = (text: string, delivery: "queue" | "interrupt") => act(() => sendTaskMessage(task!.task_id, text, delivery));
  const failure = actionError ?? error;
  const reconnecting = !failure && stream === "reconnecting";

  const newTask = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" className="h-4 w-4" />
      新建任务
    </Button>
  );

  return (
    <main className="flex h-full min-h-0 flex-col bg-card">
      <PageHeader title="任务中心" description="创建任务，让 Agent 规划、执行并汇报" actions={newTask} />
      {failure ? <Alert className="mx-6 mt-3">{failure}</Alert> : null}
      {reconnecting ? <Alert tone="warning" className="mx-6 mt-3">实时事件连接已断开，正在重连…</Alert> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <TaskList tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} />
        <section className="flex min-h-0 flex-col bg-card">
          {task ? (
            <>
              <TaskHeader task={task} onControl={(action) => void act(() => controlTask(task.task_id, action))} />
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <LiveOutput state={live} />
                    <EventLog events={events} />
                  </div>
                  {live.question ? <AgentQuestion question={live.question} onAnswer={(text) => message(text, "queue")} /> : null}
                  <Composer onSend={message} />
                </div>
                <aside className="min-h-0 overflow-y-auto border-l border-border bg-muted p-4">
                  <PlanGraph plan={plan} />
                  <AttemptTimeline attempts={live.attempts} />
                  <ApprovalInbox approvals={task.pending_approvals ?? []} onDecide={(id, decision) => void act(() => decideTaskApproval(task.task_id, id, decision))} />
                  <Artifacts manifests={artifacts} />
                </aside>
              </div>
            </>
          ) : (
            <EmptyState
              icon={ListChecks}
              title={tasks.length === 0 ? "还没有任务" : "选择一个任务"}
              description={tasks.length === 0 ? "写下目标，Agent 会先规划再执行，过程和结果都在这里看。" : "从左边选一个任务，查看它的计划、进度和输出。"}
              actions={tasks.length === 0 ? newTask : undefined}
            />
          )}
        </section>
      </div>
      {creating ? <NewTaskDialog onClose={() => setCreating(false)} onCreate={create} /> : null}
    </main>
  );
}
