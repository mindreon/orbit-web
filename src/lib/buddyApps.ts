/** WorkBuddy 文案里自带的示例应用。撤销授权后，侧栏和设置页一起变空。 */

export type BuddyApp = {
  id: string;
  name: string;
  description: string;
};

const INITIAL: BuddyApp[] = [
  {
    id: "tongdaxin",
    name: "通达信",
    description: "可直接调用选股、回测、盯盘能力，选股与策略结果实时推送到你的对话流。",
  },
];

let apps = INITIAL;
const listeners = new Set<() => void>();

export function getBuddyApps() {
  return apps;
}

export function disconnectBuddyApp(id: string) {
  apps = apps.filter((item) => item.id !== id);
  listeners.forEach((listener) => listener());
}

export function subscribeBuddyApps(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
