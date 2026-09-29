import { useCallback, useEffect, useState } from "react";
import { AgentQuestion } from "../components/tasks/AgentQuestion";
import { ApprovalInbox } from "../components/tasks/ApprovalInbox";
import { Artifacts } from "../components/tasks/Artifacts";
import { AttemptTimeline } from "../components/tasks/AttemptTimeline";
import { Composer } from "../components/tasks/Composer";
import { EventLog } from "../components/tasks/EventLog";
import { LiveOutput } from "../components/tasks/LiveOutput";
import { PlanGraph } from "../components/tasks/PlanGraph";
import { TaskHeader } from "../components/tasks/TaskHeader";
import { TaskList } from "../components/tasks/TaskList";
import { controlTask, createTask, decideTaskApproval, listTasks, sendTaskMessage, type Task } from "../lib/tasks";
import { useTaskStream } from "../lib/useTaskStream";

export function TasksPage() {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { task, plan, artifacts, events, live, stream, error } = useTaskStream(selectedId);

  useEffect(() => {
    void listTasks()
      .then((items) => {
        setTasks(items);
        const newest = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        setSelectedId((current) => current ?? newest?.task_id ?? null);
      })
      .catch((err: unknown) => setActionError(String(err)));
  }, []);

  // A task's status changes on the server; keep the list entry in step with the open task.
  useEffect(() => {
    if (task) setTasks((current) => current.map((item) => (item.task_id === task.task_id ? task : item)));
  }, [task]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    try { await run(); setActionError(null); } catch (err) { setActionError(String(err)); }
  }, []);

  const create = (input: { title: string; goal: string }) =>
    act(async () => {
      const created = await createTask(input);
      setTasks((current) => [created, ...current]);
      setSelectedId(created.task_id);
    });

  const message = (text: string, delivery: "queue" | "interrupt") => act(() => sendTaskMessage(task!.task_id, text, delivery));
  const shownError = actionError ?? error ?? (stream === "reconnecting" ? "实时事件连接已断开，正在重连…" : null);

  return (
    <main className="flex h-full min-h-0 flex-col bg-[#f6f7f9] p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Orbit TaskWorkflow</p>
          <h1 className="text-2xl font-semibold text-slate-900">任务中心</h1>
        </div>
        {shownError ? <p role="status" className="text-sm text-red-600">{shownError}</p> : null}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-4">
        <TaskList tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} onCreate={create} />
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {task ? (
            <>
              <TaskHeader task={task} onControl={(action) => void act(() => controlTask(task.task_id, action))} />
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <LiveOutput state={live} />
                    <EventLog events={events} />
                  </div>
                  {live.question ? <AgentQuestion question={live.question} onAnswer={(text) => message(text, "queue")} /> : null}
                  <Composer onSend={message} />
                </div>
                <aside className="min-h-0 overflow-y-auto border-l border-slate-100 p-4">
                  <PlanGraph plan={plan} />
                  <div className="mt-6"><AttemptTimeline attempts={live.attempts} /></div>
                  <ApprovalInbox approvals={task.pending_approvals ?? []} onDecide={(id, decision) => void act(() => decideTaskApproval(task.task_id, id, decision))} />
                  <Artifacts manifests={artifacts} />
                </aside>
              </div>
            </>
          ) : <div className="flex flex-1 items-center justify-center text-sm text-slate-400">选择或创建任务</div>}
        </section>
      </div>
    </main>
  );
}
