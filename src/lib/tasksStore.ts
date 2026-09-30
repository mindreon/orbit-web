import { create } from "zustand";
import { describeFailure } from "./api";
import { listTasks, type Task } from "./tasks";

interface TasksState {
  readonly tasks: readonly Task[];
  readonly loaded: boolean;
  readonly error: string | null;
  readonly load: () => Promise<void>;
  /** 新建或更新一个任务，列表里已有就替换，没有就放到最前面。 */
  readonly upsert: (task: Task) => void;
}

/** 侧栏、新建页和任务页共用的任务列表，谁改了任务都能同步到侧栏。 */
export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  loaded: false,
  error: null,
  load: async () => {
    try {
      const tasks = await listTasks();
      set({ tasks, loaded: true, error: null });
    } catch (err) {
      set({ loaded: true, error: describeFailure("读取任务失败", err) });
    }
  },
  upsert: (task) =>
    set((state) => ({
      tasks: state.tasks.some((item) => item.task_id === task.task_id)
        ? state.tasks.map((item) => (item.task_id === task.task_id ? task : item))
        : [task, ...state.tasks],
    })),
}));

/** 按最近更新排序，最新的在前。 */
export function newestFirst(tasks: readonly Task[]) {
  return [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
