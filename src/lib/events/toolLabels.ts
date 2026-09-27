/**
 * Turns a tool name and its redacted argsPreview (≤256 chars, possibly cut mid-JSON) into a short business phrase.
 * The raw function name never appears in the phrase; it is only shown in the collapsed detail.
 */

export interface ToolLabel {
  /** Groups consecutive calls of the same kind, e.g. three reads. */
  kind: string;
  verb: string;
  target: string;
}

type Args = Record<string, unknown> | null;

function parseArgs(preview: string): Args {
  const text = preview.trim();
  if (!text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function escapeKey(key: string) {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reads a string field from parsed args, or from the raw preview when it was truncated and is not valid JSON. */
function pick(args: Args, preview: string, keys: string[]): string {
  for (const key of keys) {
    const value = args?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") return value.join(" ").trim();
  }
  if (args) return "";
  for (const key of keys) {
    const match = preview.match(new RegExp(`["']${escapeKey(key)}["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)`));
    if (match?.[1]) return match[1].replace(/\\n/g, " ").replace(/\\(.)/g, "$1").trim();
  }
  return "";
}

function basename(path: string) {
  const clean = path.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || clean;
}

function clip(text: string, max = 60) {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function host(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const FILE_KEYS = ["path", "file_path", "filePath", "filename", "file", "target_file", "target", "source"];
const DIR_KEYS = ["path", "dir", "directory", "folder", "cwd"];
const COMMAND_KEYS = ["command", "cmd", "script", "commands"];
const QUERY_KEYS = ["query", "q", "keyword", "keywords", "search", "pattern", "regex"];
const URL_KEYS = ["url", "href", "link", "uri"];
const AGENT_KEYS = ["persona", "name", "role", "task", "instruction", "prompt", "description"];

type Rule = { kind: string; test: RegExp; label: (args: Args, preview: string) => Omit<ToolLabel, "kind"> };

const quoted = (value: string) => (value ? `“${clip(value, 40)}”` : "");

const RULES: Rule[] = [
  { kind: "delegate", test: /agent_spawn|spawn_agent|delegate|sub_?agent/, label: (a, p) => ({ verb: "委派子助手", target: clip(pick(a, p, AGENT_KEYS), 40) }) },
  { kind: "wait", test: /agent_wait/, label: () => ({ verb: "等待子助手完成", target: "" }) },
  { kind: "message", test: /agent_send/, label: (a, p) => ({ verb: "给子助手发消息", target: clip(pick(a, p, ["message", "text", ...AGENT_KEYS]), 40) }) },
  { kind: "dissolve", test: /team_dissolve/, label: () => ({ verb: "结束子助手协作", target: "" }) },
  { kind: "todo", test: /todo/, label: () => ({ verb: "更新待办", target: "" }) },
  { kind: "question", test: /question|ask_user/, label: (a, p) => ({ verb: "向你提问", target: clip(pick(a, p, ["question", "text", "prompt"]), 40) }) },
  { kind: "python", test: /python|ipython|jupyter|code_interpreter/, label: () => ({ verb: "运行 Python 代码", target: "" }) },
  { kind: "web_search", test: /web_search|search_web|google|bing|internet_search/, label: (a, p) => ({ verb: "联网搜索", target: quoted(pick(a, p, QUERY_KEYS)) }) },
  { kind: "browse", test: /fetch|browse|web_|http|crawl|scrape|open_url/, label: (a, p) => ({ verb: "打开网页", target: host(pick(a, p, URL_KEYS)) }) },
  { kind: "shell", test: /shell|bash|terminal|exec|command|run_cmd|(^|_)sh($|_)/, label: (a, p) => ({ verb: "执行命令", target: clip(pick(a, p, COMMAND_KEYS)) }) },
  { kind: "delete", test: /delete|remove|(^|_)rm($|_)|unlink/, label: (a, p) => ({ verb: "删除", target: basename(pick(a, p, FILE_KEYS)) }) },
  { kind: "edit", test: /edit|replace|patch|insert|modify|update_file/, label: (a, p) => ({ verb: "修改", target: basename(pick(a, p, FILE_KEYS)) }) },
  { kind: "write", test: /write|create_file|save|new_file/, label: (a, p) => ({ verb: "写入", target: basename(pick(a, p, FILE_KEYS)) }) },
  { kind: "read", test: /(^|_)(view|read|cat|open)($|_)|read_file|text_file/, label: (a, p) => ({ verb: "读取", target: basename(pick(a, p, FILE_KEYS)) }) },
  { kind: "find", test: /glob|find_file|file_search/, label: (a, p) => ({ verb: "查找文件", target: clip(pick(a, p, ["pattern", "glob", ...QUERY_KEYS]), 40) }) },
  { kind: "search", test: /grep|(^|_)rg($|_)|search/, label: (a, p) => ({ verb: "搜索", target: quoted(pick(a, p, QUERY_KEYS)) }) },
  { kind: "list", test: /(^|_)(ls|list|list_dir|list_files|dir)($|_)/, label: (a, p) => ({ verb: "查看目录", target: pick(a, p, DIR_KEYS) || "." }) },
];

function normalize(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function describeTool(toolName: string, argsPreview: string): ToolLabel {
  const name = normalize(toolName);
  const args = parseArgs(argsPreview);
  for (const rule of RULES) {
    if (rule.test.test(name)) return { kind: rule.kind, ...rule.label(args, argsPreview) };
  }
  const target = pick(args, argsPreview, [...FILE_KEYS, ...COMMAND_KEYS, ...QUERY_KEYS, ...URL_KEYS]);
  return { kind: `other:${name}`, verb: "使用工具", target: clip(target.includes("/") ? basename(target) : target, 40) };
}

/** 「正在读取 销售数据.xlsx」 while running, 「读取 销售数据.xlsx」 once settled. */
export function toolVerb(label: ToolLabel, running: boolean) {
  return running ? `正在${label.verb}` : label.verb;
}

export function toolTitle(label: ToolLabel, running = false) {
  const verb = toolVerb(label, running);
  return label.target ? `${verb} ${label.target}` : verb;
}

const UNITS: Record<string, string> = {
  read: "读取 {n} 个文件",
  write: "写入 {n} 个文件",
  edit: "修改 {n} 个文件",
  delete: "删除 {n} 个文件",
  shell: "执行 {n} 条命令",
  web_search: "联网搜索 {n} 次",
  browse: "打开 {n} 个网页",
  search: "搜索 {n} 次",
  find: "查找文件 {n} 次",
  list: "查看 {n} 个目录",
};

/** Summary for a run of same-kind calls, e.g. 「读取 3 个文件」. */
export function summarizeRun(labels: ToolLabel[]): string {
  const first = labels[0];
  if (!first) return "";
  const template = UNITS[first.kind];
  return template ? template.replace("{n}", String(labels.length)) : `${first.verb} ×${labels.length}`;
}
