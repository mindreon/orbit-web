import { createContext, memo, useContext, useMemo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import DOMPurify from "dompurify";
import { fromDom } from "hast-util-from-dom";
import { toHtml } from "hast-util-to-html";
import type { Element, ElementContent, Root as HastRoot, RootContent } from "hast";
import { BlockedImage } from "./BlockedImage";
import { CodeBlock } from "./CodeBlock";
import { katexModule, useLazyModule } from "./lazy";
import { normalizeMath } from "./math";
import { MermaidBlock } from "./MermaidBlock";

type MdNode = { type: string; value?: string; children?: MdNode[]; position?: { start: { offset?: number }; end: { offset?: number } }; data?: { hProperties?: Record<string, unknown> } };

/** Raw HTML in model output is shown as literal text: it is never parsed, so it cannot run. */
function remarkHtmlAsText() {
  const walk = (node: MdNode) => {
    if (node.type === "html") node.type = "text";
    node.children?.forEach(walk);
  };
  return (tree: MdNode) => walk(tree);
}

/**
 * Marks each code block as `closed` (its closing fence was written) or `open` (the text ended inside it). Only an
 * open block of a streaming message is still growing; Mermaid waits for `closed`, and the highlighter only throttles
 * on `open`. The flag travels as a `data-fence` attribute on <code>, through sanitize, to the `pre` renderer.
 */
function remarkFenceState() {
  return (tree: MdNode, file: { value: unknown }) => {
    const source = typeof file.value === "string" ? file.value : "";
    const walk = (node: MdNode) => {
      const { start, end } = node.position ?? {};
      if (node.type === "code" && start?.offset !== undefined && end?.offset !== undefined) {
        const lines = source.slice(start.offset, end.offset).split("\n");
        const open = lines[0].match(/^(`{3,}|~{3,})/);
        const close = lines.length > 1 ? lines[lines.length - 1].match(/^[\s>]*(`{3,}|~{3,})\s*$/) : null;
        const closed = !open || Boolean(close && close[1][0] === open[1][0] && close[1].length >= open[1].length);
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataFence: closed ? "closed" : "open" } };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

/**
 * The rendered Markdown goes through DOMPurify before any other rehype step: the tree is serialized,
 * purified in a detached DOM, and read back. rehype-sanitize then applies GitHub's allowlist as a second layer.
 */
function rehypeDompurify() {
  return (tree: HastRoot) => {
    const fragment = DOMPurify.sanitize(toHtml(tree), { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
    tree.children = (fromDom(fragment) as HastRoot).children;
  };
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^language-./, "math-inline", "math-display"], ["dataFence", "open", "closed"]],
  },
};

/** Wraps matches of the in-conversation search in <mark>. Runs after sanitize on trusted structure. */
function rehypeMark(options: { query: string }) {
  const needle = options.query;
  const split = (text: string): ElementContent[] => {
    const out: ElementContent[] = [];
    let from = 0;
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, from)) {
      if (at > from) out.push({ type: "text", value: text.slice(from, at) });
      out.push({ type: "element", tagName: "mark", properties: { className: ["md-mark"] }, children: [{ type: "text", value: needle }] });
      from = at + needle.length;
    }
    if (from < text.length) out.push({ type: "text", value: text.slice(from) });
    return out;
  };
  const walk = (node: HastRoot | Element) => {
    const next: RootContent[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value.includes(needle)) next.push(...split(child.value));
      else {
        if (child.type === "element") walk(child);
        next.push(child);
      }
    }
    node.children = next as typeof node.children;
  };
  return (tree: HastRoot) => {
    if (needle) walk(tree);
  };
}

function textOf(node: ElementContent | Element): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

function languageOf(node: Element) {
  const className: unknown = node.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : typeof className === "string" ? className.split(" ") : [];
  const hit = classes.find((name: string) => name.startsWith("language-"));
  return hit ? hit.slice("language-".length).toLowerCase() : "";
}

/** Whether the block is still being streamed. Read through context so finishing a block re-renders only what depends on it. */
const StreamingContext = createContext(false);

function StreamedMermaid({ code, closed }: { code: string; closed: boolean }) {
  return <MermaidBlock code={code} closed={closed} streaming={useContext(StreamingContext)} />;
}

function StreamedCode({ code, language, closed }: { code: string; language: string; closed: boolean }) {
  return <CodeBlock code={code} language={language} live={useContext(StreamingContext) && !closed} />;
}

// Type scale (the six sizes only): h1 text-title semibold; h2 and h3 text-body semibold (h3 a step quieter in colour);
// h4 text-body medium; h5 and h6 text-small medium, muted. Set in src/index.css under `.md`.

function alignOf(align: unknown) {
  return align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
}

// One stable components map: swapping maps would give every custom element a new type and re-mount code blocks.
const components: Components = {
  pre({ node, children }) {
    const code = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
    if (!code) return <pre>{children}</pre>;
    const language = languageOf(code);
    const text = textOf(code).replace(/\n$/, "");
    // Display math waits here as an ordinary block until KaTeX has loaded; show it as plain text, not as a code block.
    if (language === "math") return <pre className="whitespace-pre-wrap font-mono text-small text-muted-foreground">{text}</pre>;
    const closed = code.properties?.dataFence !== "open";
    if (language === "mermaid") return <StreamedMermaid code={text} closed={closed} />;
    return <StreamedCode code={text} language={language} closed={closed} />;
  },
  code({ node: _node, className, children, ...rest }) {
    return (
      <code className={className ? `${className} md-inline-code` : "md-inline-code"} {...rest}>
        {children}
      </code>
    );
  },
  a({ node: _node, href, children, ...rest }) {
    return (
      <a {...rest} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return <BlockedImage src={typeof src === "string" ? src : undefined} alt={alt} />;
  },
  // Full width inside a wrapper that scrolls sideways, so a wide table never widens the page.
  table({ node: _node, children, ...rest }) {
    return (
      <div className="md-table-wrap my-3 max-w-full overflow-x-auto">
        <table {...rest} className="w-full border-collapse text-small">
          {children}
        </table>
      </div>
    );
  },
  thead({ node: _node, children }) {
    return <thead className="bg-gray-100">{children}</thead>;
  },
  tr({ node: _node, children }) {
    return <tr className="border-b border-border last:border-b-0">{children}</tr>;
  },
  // CJK text wraps at any character, so without a width floor a wide table squeezes into one-glyph columns instead of scrolling.
  th({ node: _node, children, align }) {
    return <th className={`min-w-24 max-w-md px-2.5 py-2 align-top font-semibold ${alignOf(align)}`}>{children}</th>;
  },
  td({ node: _node, children, align }) {
    return <td className={`min-w-24 max-w-md px-2.5 py-2 align-top tabular-nums [overflow-wrap:break-word] ${alignOf(align)}`}>{children}</td>;
  },
};

const remarkPluginsBase: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkHtmlAsText, remarkFenceState];
const remarkPluginsMath: NonNullable<Options["remarkPlugins"]> = [remarkGfm, remarkMath, remarkHtmlAsText, remarkFenceState];

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Splits Markdown into top-level blocks at blank lines that are outside code fences and $$ math, keeping indented
 * continuation lines with their block. Earlier blocks of a streaming reply never change, so they render once.
 * Trade-off: reference-style link definitions only apply within their own block.
 */
export function splitBlocks(text: string, math = true): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let inMath = false;
  let pendingBreak = false;
  for (const line of text.split("\n")) {
    if (fence) {
      current.push(line);
      const close = line.match(FENCE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length && line.trim() === close[1]) fence = null;
      continue;
    }
    if (inMath) {
      current.push(line);
      if (line.trim() === "$$") inMath = false;
      continue;
    }
    if (!line.trim()) {
      if (current.length) pendingBreak = true;
      continue;
    }
    if (pendingBreak) {
      if (/^[ \t]/.test(line)) current.push("");
      else {
        blocks.push(current.join("\n"));
        current = [];
      }
      pendingBreak = false;
    }
    current.push(line);
    const open = line.match(FENCE);
    if (open) fence = open[1];
    else if (math && line.trim() === "$$") inMath = true;
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

type KatexPlugin = NonNullable<typeof katexModule.current>;

const MarkdownBlock = memo(function MarkdownBlock({ text, highlight, streaming, katex, math }: { text: string; highlight: string; streaming: boolean; katex: KatexPlugin | null; math: boolean }) {
  const rehypePlugins = useMemo<Options["rehypePlugins"]>(
    () => [
      rehypeDompurify,
      [rehypeSanitize, sanitizeSchema],
      ...(katex ? [[katex, { throwOnError: false, strict: "ignore", trust: false }] as [KatexPlugin, object]] : []),
      [rehypeMark, { query: highlight }],
    ],
    [highlight, katex],
  );
  return (
    <div className="md-block">
      <StreamingContext.Provider value={streaming}>
        <ReactMarkdown remarkPlugins={math ? remarkPluginsMath : remarkPluginsBase} rehypePlugins={rehypePlugins} components={components}>
          {text}
        </ReactMarkdown>
      </StreamingContext.Provider>
    </div>
  );
});

/**
 * Renders each top-level block on its own. While streaming only the last block is still growing, so it is the only
 * one that re-parses; finished blocks (including their diagrams) are never re-rendered or re-mounted.
 * `math: false` is for text a person typed: `$` in a shell command must stay literal, so no math syntax is read at all.
 */
export const Markdown = memo(function Markdown({ text, highlight = "", streaming = false, math = true }: { text: string; highlight?: string; streaming?: boolean; math?: boolean }) {
  const source = useMemo(() => (math ? normalizeMath(text) : text), [text, math]);
  const blocks = useMemo(() => splitBlocks(source, math), [source, math]);
  const katex = useLazyModule(katexModule, math && source.includes("$"));
  const needle = highlight.trim();
  return (
    <div className="md">
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          text={block}
          highlight={needle && block.includes(needle) ? needle : ""}
          streaming={streaming && index === blocks.length - 1}
          katex={math && block.includes("$") ? katex : null}
          math={math}
        />
      ))}
    </div>
  );
});
