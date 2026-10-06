/**
 * Models write math in three dialects: `$..$` / `$$..$$` (what remark-math reads), and LaTeX's `\(..\)` / `\[..\]`
 * (which Markdown treats as escaped brackets). This rewrites the second dialect into the first, and puts a multiline
 * `$$` block's delimiters on their own lines (remark-math only recognises a display block that way).
 * Fenced code and inline code are never touched, so a `$` or `\(` in a shell command stays literal.
 */

/** Lenient on purpose (list indent, blockquote marker): a fence we mistake for a fence only leaves a few lines un-normalised. */
const FENCE_OPEN = /^[ \t>]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t>]*(`{3,}|~{3,})\s*$/;
/** An inline code span: a backtick run, anything, the same run. Unclosed backticks stay in the prose. */
const INLINE_CODE = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
/** Content that is clearly LaTeX. A lone `\[1\]` (an escaped citation) has none of these and is left as text. */
const LATEXISH = /[\\^_=]/;

function mapProse(prose: string, fn: (text: string) => string) {
  let out = "";
  let from = 0;
  for (const span of prose.matchAll(INLINE_CODE)) {
    out += fn(prose.slice(from, span.index)) + span[0];
    from = span.index + span[0].length;
  }
  return out + fn(prose.slice(from));
}

/** Applies `fn` to the parts of `text` that are neither fenced code nor inline code. */
export function mapOutsideCode(text: string, fn: (prose: string) => string): string {
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (prose.length) out.push(mapProse(prose.join("\n"), fn));
    prose = [];
  };
  for (const line of text.split("\n")) {
    if (fence) {
      out.push(line);
      const close = line.match(FENCE_CLOSE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      flush();
      fence = open[1];
      out.push(line);
    } else prose.push(line);
  }
  flush();
  return out.join("\n");
}

/** What surrounds a match on its own line(s): the leading indent, and whether it is the only thing there. */
function lineContext(whole: string, at: number, length: number) {
  const lineStart = whole.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = whole.indexOf("\n", at + length);
  const before = whole.slice(lineStart, at);
  const after = whole.slice(at + length, lineEnd === -1 ? undefined : lineEnd);
  return { indent: /^[ \t]*/.exec(before)?.[0] ?? "", alone: before.trim() === "" && after.trim() === "", beforeBlank: before.trim() === "" };
}

/** A display block with its delimiters on their own lines; set apart from surrounding text when it was written inline. */
function displayBlock(body: string, context: ReturnType<typeof lineContext>) {
  const inner = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line !== "" || (index > 0 && index < all.length - 1))
    .map((line) => `${context.indent}${line}`)
    .join("\n");
  // The match starts where the line's own indent already is, unless text came before it on the line.
  const block = `$$\n${inner}\n${context.indent}$$`;
  if (context.alone) return block;
  // Text shares the line: end it before the block and start a new line after, since a display block is a block.
  return `${context.beforeBlank ? "" : `\n\n${context.indent}`}${block}\n\n${context.indent}`;
}

function normalizeProse(prose: string): string {
  if (!/[\\$]/.test(prose)) return prose;
  let out = prose.replace(/(?<!\\)\\\[([\s\S]+?)\\\]/g, (match, body: string, at: number, whole: string) => {
    const context = lineContext(whole, at, match.length);
    if (!context.alone && !LATEXISH.test(body)) return match;
    return displayBlock(body, context);
  });
  out = out.replace(/(?<!\\)\\\(((?:(?!\n[ \t]*\n)[\s\S])+?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
  out = out.replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (match, body: string, at: number, whole: string) => {
    const context = lineContext(whole, at, match.length);
    // `$$x$$` in the middle of a sentence is inline math; only multiline blocks and lone lines are display blocks.
    if (!body.includes("\n") && !context.alone) return match;
    return displayBlock(body, context);
  });
  return out;
}

export function normalizeMath(text: string): string {
  return text.includes("$") || text.includes("\\") ? mapOutsideCode(text, normalizeProse) : text;
}
