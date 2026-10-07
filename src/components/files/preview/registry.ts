import { lazy } from "react";
import type { Previewer } from "./types";

const MB = 1024 * 1024;

export const extensionOf = (name: string): string => {
  const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1);
};
const baseOf = (name: string) => name.slice(name.lastIndexOf("/") + 1).toLowerCase();
const hasExt = (name: string, list: readonly string[]) => list.includes(extensionOf(name));

/** File extension to a lowlight language (the `common` set). Names without an extension are matched by base name. */
const LANGUAGE_BY_EXT: Readonly<Record<string, string>> = {
  py: "python", go: "go", ts: "typescript", tsx: "typescript", mts: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonl: "json", yaml: "yaml", yml: "yaml", sh: "bash", bash: "bash", zsh: "bash", css: "css", scss: "scss", less: "less", sql: "sql",
  java: "java", kt: "kotlin", rs: "rust", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp", cs: "csharp", rb: "ruby", php: "php", swift: "swift", lua: "lua",
  r: "r", pl: "perl", xml: "xml", vue: "xml", toml: "ini", ini: "ini", cfg: "ini", diff: "diff", patch: "diff", graphql: "graphql", md: "markdown", markdown: "markdown",
  html: "xml", htm: "xml", svg: "xml",
};
const LANGUAGE_BY_BASE: Readonly<Record<string, string>> = { makefile: "makefile", dockerfile: "bash" };

/** The highlight language for a file, or "" when there is none. */
export function languageOf(name: string): string {
  return LANGUAGE_BY_EXT[extensionOf(name)] ?? LANGUAGE_BY_BASE[baseOf(name)] ?? "";
}

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
const SHEET_EXT = ["xlsx", "xls", "xlsm", "csv", "tsv"];

const isSvg = (name: string, mediaType = "") => mediaType === "image/svg+xml" || extensionOf(name) === "svg";

/** Also what the 源码 toggle of markdown / html / svg shows. */
export const CODE: Previewer = {
  id: "code",
  match: (name) => languageOf(name) !== "",
  load: "text",
  maxBytes: 2 * MB,
  component: lazy(() => import("./CodePreview")),
};

/**
 * The previewers, in order: the first match wins. A format the list does not know falls back to download only.
 * Each previewer is a lazy module, so a heavy renderer (PDF, Office, spreadsheets) is fetched only when such a file is opened.
 */
export const PREVIEWERS: readonly Previewer[] = [
  { id: "svg", match: isSvg, load: "text", maxBytes: 5 * MB, hasSource: true, component: lazy(() => import("./SvgPreview")) },
  { id: "image", match: (name, type = "") => type.startsWith("image/") || hasExt(name, IMAGE_EXT), load: "blob", maxBytes: 30 * MB, component: lazy(() => import("./ImagePreview")) },
  { id: "markdown", match: (name, type = "") => type === "text/markdown" || hasExt(name, ["md", "markdown", "mdx"]), load: "text", maxBytes: 2 * MB, hasSource: true, component: lazy(() => import("./MarkdownPreview")) },
  { id: "html", match: (name, type = "") => type === "text/html" || hasExt(name, ["html", "htm"]), load: "text", maxBytes: 2 * MB, hasSource: true, component: lazy(() => import("./HtmlPreview")) },
  { id: "pdf", match: (name, type = "") => type === "application/pdf" || extensionOf(name) === "pdf", load: "blob", maxBytes: 50 * MB, component: lazy(() => import("./PdfPreview")) },
  { id: "docx", match: (name) => extensionOf(name) === "docx", load: "blob", maxBytes: 30 * MB, approximate: true, component: lazy(() => import("./DocxPreview")) },
  { id: "sheet", match: (name) => hasExt(name, SHEET_EXT), load: "blob", maxBytes: 20 * MB, component: lazy(() => import("./SheetPreview")) },
  { id: "pptx", match: (name) => extensionOf(name) === "pptx", load: "blob", maxBytes: 50 * MB, approximate: true, component: lazy(() => import("./PptxPreview")) },
  CODE,
  { id: "text", match: (name, type = "") => type.startsWith("text/") || hasExt(name, ["txt", "log", "env", "gitignore", "csv"]), load: "text", maxBytes: 2 * MB, component: lazy(() => import("./TextPreview")) },
];

/** `assumeText`: the caller already holds the content as text (expert and skill files), so an unknown name still shows as plain text. */
export function findPreviewer(name: string, mediaType?: string, assumeText = false): Previewer | null {
  const hit = PREVIEWERS.find((previewer) => previewer.match(name, mediaType));
  if (hit) return hit;
  return assumeText ? (PREVIEWERS.find((previewer) => previewer.id === "text") ?? null) : null;
}
