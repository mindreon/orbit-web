/**
 * Dev/test-only datasets for the chat performance checks (acceptance #9 and #16).
 * Deterministic, so every run renders the same conversation. Never imported by the app.
 */

const ROOM = "room-e2e";
const T0 = Date.UTC(2026, 8, 26, 8, 0, 0);

function event(sequence, patch) {
  return {
    id: `ds-${sequence}`,
    sequence,
    roomId: ROOM,
    sessionId: "ses-dataset",
    source: "worker",
    agentId: "main",
    agentPath: "main",
    modelMode: "fake",
    modelName: "fixture",
    occurredAt: new Date(T0 + sequence * 1000).toISOString(),
    ...patch,
  };
}

/** `count` alternating user/assistant messages with light Markdown. */
export function conversation(count) {
  return Array.from({ length: count }, (_, index) => {
    const turn = Math.floor(index / 2);
    return event(index + 1, {
      type: "assistant.message",
      role: index % 2 === 0 ? "user" : "assistant",
      turnId: `ds-tn-${turn}`,
      text:
        index % 2 === 0
          ? `第 ${turn + 1} 个问题：这份材料里的第 ${turn + 1} 项要怎么处理？`
          : `第 ${turn + 1} 项的处理：\n\n1. 先核对**主体信息**\n2. 再看 \`条款 ${turn}\`\n\n| 项 | 值 |\n|---|---|\n| 序号 | ${turn + 1} |`,
    });
  });
}

const PARAGRAPH =
  "根据合同第七条的约定，违约金按日万分之五计算，但合同没有约定上限。结合民法典第五百八十五条及相关司法解释，约定的违约金过分高于造成的损失时，当事人可以请求适当减少。建议在补充协议中把上限写明为合同金额的百分之二十，并同步修改付款节点。";

function codeBlock(section) {
  const lines = [
    "```typescript",
    `// 第 ${section} 节：违约金计算`,
    "export interface Clause { id: string; amount: number; overdueDays: number; capRatio?: number }",
    "",
    "export function penalty(clause: Clause): number {",
    "  const daily = clause.amount * 0.0005;",
    "  const raw = daily * clause.overdueDays;",
    "  const cap = clause.amount * (clause.capRatio ?? 0.2);",
    `  return Math.min(raw, cap); // section ${section}: a deliberately long trailing comment so this line is wider than a phone screen and has to scroll inside the code block`,
    "}",
    "",
    "export const samples: Clause[] = [",
  ];
  for (let row = 0; row < 12; row += 1) lines.push(`  { id: "c-${section}-${row}", amount: ${100000 + row * 2500}, overdueDays: ${row * 3} },`);
  lines.push("];", "```");
  return lines.join("\n");
}

function wideTable(section) {
  const head = ["条款", "原文摘要", "风险", "建议修改", "依据", "负责人", "截止日期", "状态"];
  const rows = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (let row = 0; row < 10; row += 1) {
    rows.push(
      `| 第 ${section}.${row + 1} 条 | 甲方应在验收合格后三十日内一次性支付全部合同价款 | ${["低", "中", "高"][row % 3]} | 改为分期付款并保留百分之十质保金 | 民法典第五百八十五条 | 法务部 | 2026-10-${String((row % 28) + 1).padStart(2, "0")} | 待确认 |`,
    );
  }
  return rows.join("\n");
}

/** One assistant reply of at least `chars` characters, mixing headings, paragraphs, lists, code blocks and wide tables. */
export function longReply(chars) {
  const parts = ["# 合同审阅完整报告\n"];
  let length = parts[0].length;
  for (let section = 1; length < chars; section += 1) {
    const block = [
      `## 第 ${section} 节`,
      `${PARAGRAPH}${PARAGRAPH}`,
      `- 风险点 ${section}.1：付款节点过早\n- 风险点 ${section}.2：违约金无上限\n- 风险点 ${section}.3：争议解决地不利`,
      section % 2 === 1 ? codeBlock(section) : wideTable(section),
      PARAGRAPH,
    ].join("\n\n");
    parts.push(block);
    length += block.length + 2;
  }
  return parts.join("\n\n");
}

/** The conversation used by the perf checks: `messages` history, then one user question and a `replyChars` reply. */
export function perfDataset({ messages = 1000, replyChars = 50000 } = {}) {
  const items = conversation(messages);
  let sequence = items.length;
  items.push(event(++sequence, { type: "assistant.message", role: "user", turnId: "ds-long", text: "把整份合同的审阅报告完整写出来。" }));
  if (replyChars > 0) items.push(event(++sequence, { type: "assistant.message", role: "assistant", turnId: "ds-long", blockId: "ds-long-b", text: longReply(replyChars) }));
  return items;
}

/** The long reply cut into assistant.delta frames, for measuring while it streams. */
export function replyDeltas(text, { turnId = "ds-stream", blockId = "ds-stream-b", size = 50 } = {}) {
  const frames = [];
  for (let at = 0, seq = 1; at < text.length; at += size, seq += 1) {
    frames.push({ data: { type: "assistant.delta", roomId: ROOM, sessionId: "ses-dataset", agentId: "main", agentPath: "main", turnId, blockId, seq, delta: text.slice(at, at + size) } });
  }
  return frames;
}
