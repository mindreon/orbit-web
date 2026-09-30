import { useEffect, useMemo, useState } from "react";
import { describeFailure } from "./api";
import { applyEvent, emptyLiveState, markStreamGap, mergeEvent, type TaskLiveState } from "./taskEvents";
import { getPlan, getTask, listTaskArtifacts, subscribeTaskEvents, type ArtifactManifest, type Plan, type StreamState, type Task, type TaskEvent } from "./tasks";

export interface TaskStream {
  readonly task: Task | null;
  readonly plan: Plan | null;
  readonly artifacts: readonly ArtifactManifest[];
  readonly events: readonly TaskEvent[];
  readonly live: TaskLiveState;
  readonly stream: StreamState;
  readonly error: string | null;
}

const idle: TaskStream = { task: null, plan: null, artifacts: [], events: [], live: emptyLiveState, stream: "connected", error: null };

/** Loads one task and keeps it current from its event stream. */
export function useTaskStream(taskId: string | null): TaskStream {
  const [task, setTask] = useState<Task | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [artifacts, setArtifacts] = useState<readonly ArtifactManifest[]>([]);
  const [events, setEvents] = useState<readonly TaskEvent[]>([]);
  const [gaps, setGaps] = useState(0);
  const [stream, setStream] = useState<StreamState>("connected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTask(null); setPlan(null); setArtifacts([]); setEvents([]); setGaps(0); setError(null);
    if (!taskId) return;
    let active = true;
    // Every durable event starts a refresh, and responses can come back out of order: only the newest one may land.
    let latest = 0;
    const fail = (err: unknown) => { if (active) setError(describeFailure("读取任务失败", err)); };
    const refresh = () => {
      const mine = ++latest;
      const current = () => active && mine === latest;
      void getTask(taskId).then((next) => current() && setTask(next)).catch(fail);
      void getPlan(taskId).then((next) => current() && setPlan(next)).catch(fail);
      void listTaskArtifacts(taskId).then((next) => current() && setArtifacts(next)).catch(() => undefined);
    };
    refresh();
    const close = subscribeTaskEvents(
      taskId,
      (event) => {
        setEvents((current) => mergeEvent(current, event));
        if (event.seq > 0) refresh();
      },
      (state) => {
        setStream(state);
        if (state === "reconnecting") setGaps((count) => count + 1);
      },
    );
    return () => { active = false; close(); };
  }, [taskId]);

  const live = useMemo(() => {
    const folded = events.reduce(applyEvent, emptyLiveState);
    return gaps > 0 ? markStreamGap(folded) : folded;
  }, [events, gaps]);

  return taskId ? { task, plan, artifacts, events, live, stream, error } : idle;
}
