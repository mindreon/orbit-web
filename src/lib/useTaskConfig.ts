import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeFailure } from "./api";
import { emptyDraft, draftToInput, getTaskConfig, updateTaskConfig, viewToDraft, type ConfigDraft, type TaskConfigView, type TeamView } from "./taskConfig";

export type TaskConfigState = {
  readonly draft: ConfigDraft;
  readonly version: number;
  readonly notice: string;
  readonly error: string;
  /** 配置读到之前不能改：此时没有可以依据的版本。 */
  readonly ready: boolean;
  readonly apply: (next: ConfigDraft) => void;
  /** 任务选的是专家团时它的领队和成员（成员带专家名），否则 null。 */
  readonly team: TeamView | null;
};

/**
 * 任务当前的配置，以及中途修改它。每次修改都带着读到的版本，所以连续点选会排队依次提交，而不是互相覆盖；
 * 过期（别处改过）时重新读取并提示。新配置从任务的下一次执行起生效，正在运行的那次不受影响。
 */
export function useTaskConfig(taskId: string | null): TaskConfigState {
  const [view, setView] = useState<TaskConfigView | null>(null);
  const [labels, setLabels] = useState<Readonly<Record<string, string>>>({});
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const latest = useRef<TaskConfigView | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    if (!taskId) return;
    const next = await getTaskConfig(taskId);
    const fresh = viewToDraft(next);
    latest.current = next;
    setView(next);
    setDraft((current) => ({ ...fresh, labels: current.labels }));
  }, [taskId]);

  useEffect(() => {
    latest.current = null;
    setView(null);
    setNotice("");
    setError("");
    if (!taskId) return;
    let gone = false;
    getTaskConfig(taskId)
      .then((next) => {
        const fresh = viewToDraft(next);
        if (gone) return;
        latest.current = next;
        setView(next);
        setDraft(fresh);
      })
      .catch((err: unknown) => !gone && setError(describeFailure("读取任务配置失败", err)));
    return () => {
      gone = true;
    };
  }, [taskId]);

  const apply = useCallback(
    (next: ConfigDraft) => {
      if (!taskId) return;
      setDraft(next);
      setLabels(next.labels);
      setError("");
      queue.current = queue.current.then(async () => {
        try {
          // The first read can still be on its way when someone clicks; wait for it rather than drop the choice.
          if (latest.current === null) await load();
          const base = latest.current?.config_version;
          if (base === undefined) throw new Error("no configuration version");
          const result = await updateTaskConfig(taskId, base, draftToInput(next));
          await load();
          setNotice(`配置已更新（第 ${result.config_version} 版），从任务的下一次执行起生效`);
        } catch (err) {
          setNotice("");
          setError(err instanceof ApiError && err.status === 409 ? "任务的配置刚被改过，已重新读取，请再选一次" : describeFailure("更新任务配置失败", err));
          await load().catch(() => undefined);
        }
      });
    },
    [taskId, load],
  );

  return { draft: { ...draft, labels: { ...labels, ...draft.labels } }, version: view?.config_version ?? 1, notice, error, ready: view !== null, apply, team: view?.team ?? null };
}
