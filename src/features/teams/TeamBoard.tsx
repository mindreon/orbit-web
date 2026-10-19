import { describeFailure, isRetryable } from "../../api/errors";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Markdown } from "../../components/markdown/Markdown";
import { StatusBadge } from "../../components/StatusBadge";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useTeam, useTeamSignal } from "./api";
import { memberStatusLabels, roleLabels, taskStatusLabels, verdictLabels } from "./labels";
type BoardProps = { runId: string; active?: boolean; teamSignal?: number };
/** Keep a broken board local to its session panel or replay section. */
class BoardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Alert>任务板显示失败，请刷新后重试。</Alert> : this.props.children; }
}
export function TeamBoard(props: BoardProps) {
  return <BoardBoundary key={props.runId}><BoardContent {...props} /></BoardBoundary>;
}
function BoardContent({ runId, active = false, teamSignal = 0 }: BoardProps) {
  const query = useTeam(runId, active); useTeamSignal(runId, teamSignal);
  if (query.error) return <Alert>{describeFailure("读取任务板失败", query.error)}{isRetryable(query.error) ? <Button size="sm" onClick={() => void query.refetch()}>重试</Button> : null}</Alert>;
  if (query.data === null) return <p className="text-small text-muted-foreground">{active ? "暂无任务，负责人创建任务后会显示在这里。" : "没有任务板"}</p>;
  if (!query.data) return <Skeleton className="h-40" />;
  const { members, board, finished, summary } = query.data;
  return <div className="min-w-0 space-y-4" data-testid="team-board">
    {finished ? <div className="rounded-card bg-success-50 p-4"><h3 className="mb-2 text-small font-semibold">总结</h3>{summary ? <Markdown text={summary} /> : <p className="text-small text-muted-foreground">没有总结</p>}</div> : null}
    <div aria-label="成员" className="flex flex-wrap gap-2">{members.map((member) => <article key={member.name} className="min-w-44 flex-1 rounded-card bg-card p-3" data-member={member.name}><div className="flex items-center gap-2">{member.status === "working" ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary-500 motion-safe:animate-pulse" /> : null}<span className="truncate font-mono text-small font-medium">{member.name}</span><span className="ml-auto text-caption text-muted-foreground">{roleLabels[member.role]}</span></div><div className="mt-2"><StatusBadge status={member.status}>{memberStatusLabels[member.status]}</StatusBadge></div><p className="mt-2 truncate text-caption text-muted-foreground">{board.tasks.find((task) => task.task_id === member.task_id)?.title ?? "暂无任务"}</p></article>)}</div>
    {!board.tasks.length ? <p className="text-small text-muted-foreground">暂无任务，负责人创建任务后会显示在这里。</p> : null}
    <div aria-label="任务列" className="grid min-w-0 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(taskStatusLabels).map(([status, label]) => {
      const tasks = board.tasks.filter((task) => task.status === status);
      return <section key={status} data-testid="task-lane" data-status={status} aria-label={label} className="min-w-0 rounded-card bg-muted p-2"><h3 className="px-1 pb-2 text-caption font-medium text-muted-foreground">{label} · {tasks.length}</h3><div className="space-y-2">{tasks.map((task) => <article key={task.task_id} data-task-id={task.task_id} className="space-y-2 rounded-control bg-card p-3"><h4 className="line-clamp-2 text-small font-medium">{task.title}</h4><div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground"><span className="rounded-control bg-gray-100 px-1.5 font-mono">{task.assignee ?? "未分配"}</span><span title={task.deps.join("、")}>依赖 {task.deps.length}</span>{task.attempts > 1 ? <span>尝试 {task.attempts} 次</span> : null}</div>{task.review?.votes.map((vote) => <div key={vote.reviewer} className="space-y-1 text-caption"><div className="flex items-center gap-2"><span className="font-mono">{vote.reviewer}</span><StatusBadge status={vote.verdict}>{verdictLabels[vote.verdict]}</StatusBadge></div>{vote.comment ? <p title={vote.comment} className="line-clamp-3 text-muted-foreground">{vote.comment}</p> : null}</div>)}</article>)}</div></section>;
    })}</div>
  </div>;
}
export function SessionTeamBoard({ runId, active, teamSignal = 0 }: { runId: string; active: boolean; teamSignal?: number }) {
  const [open, setOpen] = useState(active);
  useEffect(() => { setOpen(active); }, [active]);
  return <details open={open} onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }} className="min-w-0 rounded-card bg-gray-50 p-3"><summary className="cursor-pointer text-small font-medium">专家团任务板</summary>{open ? <div className="mt-3"><TeamBoard runId={runId} active={active} teamSignal={teamSignal} /></div> : null}</details>;
}
