import { memo, useMemo } from "react";
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
import { MermaidBlock } from "./MermaidBlock";

type MdNode = { type: string; value?: string; children?: MdNode[] };

/** Raw HTML in model output is shown as literal text: it is never parsed, so it cannot run. */
function remarkHtmlAsText() {
  const walk = (node: MdNode) => {
    if (node.type === "html") node.type = "text";
    node.children?.forEach(walk);
  };
  return (tree: MdNode) => walk(tree);
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
    code: [["className", /^language-./, "math-inline", "math-display"]],
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

function buildComponents(streaming: boolean): Components {
  return {
    pre({ node, children }) {
      const code = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
      if (!code) return <pre>{children}</pre>;
      const language = languageOf(code);
      const text = textOf(code).replace(/\n$/, "");
      if (language === "mermaid") return <MermaidBlock code={text} streaming={streaming} />;
      return <CodeBlock code={text} language={language} />;
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
    table({ node: _node, children, ...rest }) {
      return (
        <div className="md-table-wrap">
          <table {...rest}>{children}</table>
        </div>
      );
    },
  };
}

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkMath, remarkHtmlAsText];
const staticComponents = buildComponents(false);
const streamingComponents = buildComponents(true);

export const Markdown = memo(function Markdown({ text, highlight = "", streaming = false }: { text: string; highlight?: string; streaming?: boolean }) {
  const katex = useLazyModule(katexModule, text.includes("$"));
  const rehypePlugins = useMemo<Options["rehypePlugins"]>(
    () => [
      rehypeDompurify,
      [rehypeSanitize, sanitizeSchema],
      ...(katex ? [[katex, { throwOnError: false, strict: "ignore", trust: false }] as [typeof katex, object]] : []),
      [rehypeMark, { query: highlight.trim() }],
    ],
    [highlight, katex],
  );
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={streaming ? streamingComponents : staticComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
