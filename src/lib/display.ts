/**
 * The one place where internal wording becomes user wording: profile refs, plan nodes, catalog tags, frontmatter.
 * Pure functions, no React. Anything not mapped here is either hidden or shown through a neutral fallback, never raw.
 */

export const DEFAULT_AGENT_NAME = "默认智能体";
const CUSTOM_EXPERT_NAME = "自定义专家";

type ExpertLike = { readonly expert_id: string; readonly ref: string; readonly name: string };

/** `writer@2` -> { id: "writer", version: 2 }; anything else is null. */
function splitRef(ref: string): { id: string; version: number } | null {
  const match = /^([^@\s]+)@(\d+)$/.exec(ref.trim());
  return match ? { id: match[1], version: Number(match[2]) } : null;
}

/**
 * What to call a profile on screen. The built-in profile is the default agent; an expert is shown by name
 * (an older or newer version of the same expert has the same name); a ref nobody here knows never shows its id.
 */
export function profileName(ref: string | undefined, experts: readonly ExpertLike[]): string {
  const value = (ref ?? "").trim();
  if (value === "") return DEFAULT_AGENT_NAME;
  const exact = experts.find((expert) => expert.ref === value);
  if (exact) return exact.name;
  const parts = splitRef(value);
  const id = parts?.id ?? value;
  if (id === "default") return DEFAULT_AGENT_NAME;
  return experts.find((expert) => expert.expert_id === id)?.name ?? CUSTOM_EXPERT_NAME;
}

/** Free text that mentions profile refs (`default@1 -> writer@2`): every ref becomes its display name. */
export function humanizeProfileRefs(text: string, nameOf: (ref: string) => string): string {
  return text.replace(/(?<![\w@.-])[A-Za-z][\w.-]*@\d+(?![\w@])/g, (ref) => nameOf(ref));
}

/**
 * Expert text often starts with YAML frontmatter (`--- name: x description: y ---`), sometimes with its line breaks
 * collapsed. Returns the text after it; when nothing follows, the frontmatter's own description.
 */
export function stripFrontmatter(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return text.trim();
  const rest = trimmed.slice(3);
  const close = /(^|\s)---(?=\s|$)/.exec(rest);
  const block = close ? rest.slice(0, close.index) : rest;
  const body = close ? rest.slice(close.index + close[0].length).trim() : "";
  if (body !== "") return body;
  const description = /(?:^|\s)description:\s*(.*?)\s*$/s.exec(block)?.[1] ?? "";
  // A multi-line block ends the description at the next key; a collapsed one has nothing after it.
  return description.split(/\n\s*[A-Za-z_-]+:\s/)[0].trim();
}

/** Node titles the system writes itself, in the user's language. The agent's own titles pass through. */
const SYSTEM_NODE_TITLES: Readonly<Record<string, string>> = {
  "Explore and plan": "理解目标并规划",
};

export const nodeTitle = (title: string): string => SYSTEM_NODE_TITLES[title] ?? title;

/** The ordinary step (an agent turn) needs no label of its own; unknown types are not shown. */
const NODE_TYPE_LABELS: Readonly<Record<string, string>> = { agent_turn: "" };

export const nodeTypeLabel = (type: string): string => NODE_TYPE_LABELS[type] ?? "";

/** ModelScope agent catalogue keys. A key that is not listed has no label and its chip is hidden. */
const CATALOGUE_LABELS: Readonly<Record<string, string>> = {
  "development-tools": "开发工具",
  others: "其他",
  marketing: "市场营销",
  education: "教育",
  finance: "金融",
  design: "设计",
  product: "产品",
  sales: "销售",
  entertainment: "娱乐",
  "life-assistant": "生活助手",
};

export const catalogueLabel = (key: string): string => CATALOGUE_LABELS[key] ?? "";

/** Agent framework tags from the catalog. Unlisted frameworks are hidden. */
const FRAMEWORK_LABELS: Readonly<Record<string, string>> = {
  "ms-agent": "魔搭智能体",
  qwenpaw: "千问智能体",
};

export const frameworkLabel = (framework: string): string => FRAMEWORK_LABELS[framework] ?? "";

/** A one-line summary of an expert's instructions for lists and menus: no frontmatter, no line breaks. */
export function expertSummary(instructions: string): string {
  return stripFrontmatter(instructions).replace(/\s+/g, " ").trim();
}

// ---- SOP plans ---------------------------------------------------------------------------------------------------

type PlanNodeLike = {
  readonly node_id: string;
  readonly status: string;
  readonly parent_node_id?: string | null;
  readonly sop_step?: { readonly sop: string; readonly role: string; readonly total: number; readonly index: number; readonly subject: string } | null;
};

/** `release@2` -> `release`. */
export const sopName = (ref: string): string => ref.replace(/@\d+$/, "");

/** One line for a node that belongs to a compiled SOP: "release · 第 2/3 步 · review". */
export function sopStepLabel(step: NonNullable<PlanNodeLike["sop_step"]>): string {
  return `${sopName(step.sop)} · 第 ${step.index}/${step.total} 步 · ${step.subject}`;
}

/** What an approval inside a SOP is about, in words: "开始前" / "完成后". Other roles have none. */
export const approvalRoleLabel = (role: string): string => (role === "approval_before" ? "步骤开始前" : role === "approval_after" ? "步骤完成后" : "");

export type PlanEntry<T extends PlanNodeLike> = { readonly node: T; readonly children: readonly T[] };

/**
 * The plan as the user reads it: a SOP's compiled nodes sit under the SOP node, everything else stays on its own.
 * A node whose SOP node is no longer in the plan (compacted away) is shown on its own rather than dropped.
 */
export function groupPlan<T extends PlanNodeLike>(nodes: readonly T[]): PlanEntry<T>[] {
  const ids = new Set(nodes.map((node) => node.node_id));
  const nested = (node: T) => Boolean(node.sop_step && node.parent_node_id && ids.has(node.parent_node_id));
  return nodes.filter((node) => !nested(node)).map((node) => ({ node, children: nodes.filter((child) => nested(child) && child.parent_node_id === node.node_id) }));
}

/** How far a SOP got, counted in steps (approvals are not steps): finished / total. */
export function sopProgress(children: readonly PlanNodeLike[]): { done: number; total: number } {
  const steps = children.filter((child) => child.sop_step?.role === "step");
  return { done: steps.filter((child) => child.status === "COMPLETED").length, total: steps[0]?.sop_step?.total ?? steps.length };
}
