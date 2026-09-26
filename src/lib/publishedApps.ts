/** 已发布应用只留在这次打开的页面里，链接指向云端任务。 */

export type AppStatus = "已发布" | "已下线" | "未发布";

export type PublishedApp = {
  id: string;
  name: string;
  matterId: string;
  taskTitle: string;
  status: AppStatus;
  link: string;
  publishedAt: string;
};

let apps: PublishedApp[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPublishedApps() {
  return apps;
}

export function subscribePublishedApps(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishApp(input: { id: string; name: string; matterId: string; taskTitle: string }) {
  const next: PublishedApp = {
    id: input.id,
    name: input.name,
    matterId: input.matterId,
    taskTitle: input.taskTitle,
    status: "已发布",
    link: `${location.origin}/task/${input.matterId}?file=${encodeURIComponent(input.name)}`,
    publishedAt: new Date().toISOString().slice(0, 10),
  };
  apps = [next, ...apps.filter((item) => item.id !== next.id)];
  emit();
  return next;
}

export function unpublishApp(id: string) {
  apps = apps.map((item) => (item.id === id ? { ...item, status: "已下线" } : item));
  emit();
}
