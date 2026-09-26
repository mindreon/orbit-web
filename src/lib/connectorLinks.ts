/** 连接器的连接状态留在这次打开的页面里，设置页和专家页读同一份。 */

let overrides: Record<string, boolean> = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getConnectorOverrides() {
  return overrides;
}

export function subscribeConnectorLinks(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isConnectorLinked(id: string, fallback: boolean) {
  return id in overrides ? overrides[id] : fallback;
}

export function setConnectorLinked(id: string, linked: boolean) {
  overrides = { ...overrides, [id]: linked };
  emit();
}
