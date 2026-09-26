/** Turns a tool name and its redacted argsPreview (≤256 chars, possibly cut mid-JSON) into a short business phrase. */

export interface ToolLabel {
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

type Rule = { test: RegExp; label: (args: Args, preview: string, name: string) => ToolLabel };

const quoted = (value: string) => (value ? `“${clip(value, 40)}”` : "");

const RULES: Rule[] = [
  { test: /agent_spawn|spawn_agent|delegate|sub_?agent/, label: (a, p) => ({ verb: "委派子助手", target: clip(pick(a, p, AGENT_KEYS), 40) }) },
  { test: /agent_wait/, label: () => ({ verb: "等待子助手完成", target: "" }) },
  { test: /agent_send/, label: (a, p) => ({ verb: "给子助手发消息", target: clip(pick(a, p, ["message", "text", ...AGENT_KEYS]), 40) }) },
  { test: /team_dissolve/, label: () => ({ verb: "结束子助手协作", target: "" }) },
  { test: /todo/, label: () => ({ verb: "更新待办", target: "" }) },
  { test: /question|ask_user/, label: (a, p) => ({ verb: "向你提问", target: clip(pick(a, p, ["question", "text", "prompt"]), 40) }) },
  { test: /python|ipython|jupyter|code_interpreter/, label: () => ({ verb: "运行 Python 代码", target: "" }) },
  { test: /web_search|search_web|google|bing|internet_search/, label: (a, p) => ({ verb: "联网搜索", target: quoted(pick(a, p, QUERY_KEYS)) }) },
  { test: /fetch|browse|web_|http|crawl|scrape|open_url/, label: (a, p) => ({ verb: "打开网页", target: host(pick(a, p, URL_KEYS)) }) },
  { test: /shell|bash|terminal|exec|command|run_cmd|(^|_)sh($|_)/, label: (a, p) => ({ verb: "执行命令", target: clip(pick(a, p, COMMAND_KEYS)) }) },
  { test: /delete|remove|(^|_)rm($|_)|unlink/, label: (a, p) => ({ verb: "删除", target: basename(pick(a, p, FILE_KEYS)) }) },
  { test: /edit|replace|patch|insert|modify|update_file/, label: (a, p) => ({ verb: "修改", target: basename(pick(a, p, FILE_KEYS)) }) },
  { test: /write|create_file|save|new_file/, label: (a, p) => ({ verb: "写入", target: basename(pick(a, p, FILE_KEYS)) }) },
  { test: /(^|_)(view|read|cat|open)($|_)|read_file|text_file/, label: (a, p) => ({ verb: "读取", target: basename(pick(a, p, FILE_KEYS)) }) },
  { test: /glob|find_file|file_search/, label: (a, p) => ({ verb: "查找文件", target: clip(pick(a, p, ["pattern", "glob", ...QUERY_KEYS]), 40) }) },
  { test: /grep|(^|_)rg($|_)|search/, label: (a, p) => ({ verb: "搜索", target: quoted(pick(a, p, QUERY_KEYS)) }) },
  { test: /(^|_)(ls|list|list_dir|list_files|dir)($|_)/, label: (a, p) => ({ verb: "查看目录", target: pick(a, p, DIR_KEYS) || "." }) },
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
    if (rule.test.test(name)) return rule.label(args, argsPreview, toolName);
  }
  const target = pick(args, argsPreview, [...FILE_KEYS, ...COMMAND_KEYS, ...QUERY_KEYS, ...URL_KEYS]);
  return { verb: toolName ? `调用 ${toolName}` : "调用工具", target: clip(target.includes("/") ? basename(target) : target, 40) };
}

export function toolTitle(label: ToolLabel) {
  return label.target ? `${label.verb} ${label.target}` : label.verb;
}

/** One-line summary for a collapsed group, e.g. 「读取 2 个文件，执行 1 条命令」. */
export function summarizeTools(labels: ToolLabel[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label.verb, (counts.get(label.verb) ?? 0) + 1);
  const unit: Record<string, string> = { 读取: "个文件", 写入: "个文件", 修改: "个文件", 删除: "个文件", 执行命令: "条", 联网搜索: "次", 打开网页: "个", 搜索: "次", 查看目录: "个" };
  const parts = [...counts.entries()].map(([verb, count]) => {
    if (count === 1) return verb;
    return unit[verb] ? `${verb} ${count} ${unit[verb]}` : `${verb} ×${count}`;
  });
  return parts.join("，");
}
