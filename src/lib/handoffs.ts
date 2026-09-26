/** 从任务流转出来的待办，只留在这次打开的页面里。 */

export type HandoffTodo = {
  id: string;
  title: string;
  description: string;
  owner: string;
  source: string;
  status: "待开始" | "进行中" | "暂停" | "完成";
};

let items: HandoffTodo[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getHandoffs() {
  return items;
}

export function subscribeHandoffs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addHandoff(input: { title: string; description: string; owner: string; source: string }) {
  items = [{ id: `handoff-${Date.now()}`, status: "待开始", ...input }, ...items];
  emit();
}

export function updateHandoff(id: string, patch: Partial<Pick<HandoffTodo, "title" | "description" | "owner" | "status">>) {
  items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  emit();
}
