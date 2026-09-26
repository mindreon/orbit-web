/** 快捷键列表。默认按键只写原文里能对上的那几条，其余是「未指定」。刷新后回到这份初始表。 */

export type ShortcutRow = {
  category: string;
  command: string;
  keys: string;
};

const INITIAL: ShortcutRow[] = [
  { category: "面板·窗口", command: "唤起/隐藏主窗口", keys: "未指定" },
  { category: "面板·窗口", command: "打开设置", keys: "未指定" },
  { category: "面板·窗口", command: "打开全局搜索", keys: "未指定" },
  { category: "面板·窗口", command: "进入/退出全屏", keys: "未指定" },
  { category: "面板·窗口", command: "切换左侧栏", keys: "未指定" },
  { category: "面板·窗口", command: "切换右侧产物面板", keys: "未指定" },
  { category: "任务", command: "新建对话", keys: "未指定" },
  { category: "任务", command: "新建快速问答", keys: "未指定" },
  { category: "任务", command: "上一个任务", keys: "未指定" },
  { category: "任务", command: "下一个任务", keys: "未指定" },
  { category: "任务", command: "定位当前任务", keys: "未指定" },
  { category: "任务", command: "全局搜索", keys: "未指定" },
  { category: "聊天", command: "发送消息", keys: "未指定" },
  { category: "聊天", command: "输入时换行", keys: "未指定" },
  { category: "聊天", command: "停止生成", keys: "未指定" },
  { category: "聊天", command: "对话内搜索", keys: "⌘F" },
  { category: "聊天", command: "语音录制开关", keys: "未指定" },
  { category: "聊天", command: "唤起选择器", keys: "未指定" },
  { category: "聊天", command: "唤起斜杠命令", keys: "未指定" },
  { category: "通用", command: "放大内容字号", keys: "未指定" },
  { category: "通用", command: "缩小内容字号", keys: "未指定" },
  { category: "通用", command: "重置内容字号", keys: "未指定" },
];

const RESERVED: Record<string, string> = {
  "⌘Q": "此快捷键为系统退出快捷键，无法绑定",
  "⌘C": "此快捷键为系统复制快捷键，无法绑定",
  "⌘V": "此快捷键为系统粘贴快捷键，无法绑定",
  "⌘X": "此快捷键为系统剪切快捷键，无法绑定",
  "⌘W": "此快捷键为系统关闭窗口快捷键，无法绑定",
  "⌘A": "此快捷键为系统全选快捷键，无法绑定",
  "⌘Z": "此快捷键为系统撤销快捷键，无法绑定",
  "⌘Tab": "此快捷键为系统应用切换快捷键，无法绑定",
  "⌘M": "此快捷键为系统最小化窗口快捷键，无法绑定",
  "⌘R": "此快捷键为系统刷新页面快捷键，无法绑定",
};

const listeners = new Set<() => void>();
let rows = INITIAL.map((row) => ({ ...row }));
let capturing = false;

export function getShortcuts() {
  return rows;
}

export function subscribeShortcuts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish() {
  rows = rows.map((row) => ({ ...row }));
  listeners.forEach((listener) => listener());
}

export function isShortcutCapture() {
  return capturing;
}

export function setShortcutCapture(on: boolean) {
  capturing = on;
}

export function assignShortcut(command: string, keys: string) {
  rows = rows.map((row) => (row.command === command ? { ...row, keys } : row));
  publish();
}

export function resetShortcut(command: string) {
  const initial = INITIAL.find((row) => row.command === command);
  if (!initial) return;
  assignShortcut(command, initial.keys);
}

export function resetAllShortcuts() {
  rows = INITIAL.map((row) => ({ ...row }));
  publish();
}

/** 把一次按键收成和列表里一样的写法。只有修饰键时返回 null。没有修饰键时返回空字符串。 */
export function chordFromEvent(event: KeyboardEvent) {
  if (["Meta", "Control", "Alt", "Shift", "Escape"].includes(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey) parts.push("⌘");
  if (event.altKey) parts.push("⌥");
  if (event.shiftKey) parts.push("⇧");
  if (event.ctrlKey) parts.push("⌃");
  if (parts.length === 0) return "";
  const label = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return parts.join("") + label;
}

export function shortcutProblem(command: string, keys: string) {
  if (!keys) return "未指定按键";
  const reserved = RESERVED[keys];
  if (reserved) return reserved;
  const owner = rows.find((row) => row.command !== command && row.keys === keys);
  if (owner) return `"${keys}"已被"${owner.command}"使用`;
  return null;
}
