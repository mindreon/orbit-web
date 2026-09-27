/**
 * Initial bundle (acceptance #9): heavy renderers stay out of the entry chunk; the entry growth is recorded.
 * Reads dist/ produced by playwright.perf.config.ts's `vite build`.
 *
 * Ways this can fail (each is asserted below):
 *   B1 KaTeX, the syntax highlighter (lowlight/highlight.js) or Mermaid is bundled into the entry chunk.
 *   B2 the lazy chunks for them do not exist (they would have to be in the entry then).
 */
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { metrics, verify } from "../helpers";
import { expect, test } from "../test";

// main @ e86cd19, `vite build`, same zlib gzip as below.
const BASE = { ref: "e86cd19", entryJs: 426135, entryJsGzip: 128080, entryCss: 19061, entryCssGzip: 4734 };

const ASSETS = "dist/assets";

function size(file: string) {
  const bytes = readFileSync(`${ASSETS}/${file}`);
  return { bytes: bytes.length, gzip: gzipSync(bytes).length, text: bytes.toString("utf8") };
}

test("Mermaid, KaTeX and the highlighter load on demand; entry bundle growth is recorded", { tag: ["@acc-9"] }, async () => {
  const files = readdirSync(ASSETS);
  const entryJs = files.find((file) => /^index-.*\.js$/.test(file))!;
  const entryCss = files.find((file) => /^index-.*\.css$/.test(file))!;
  const js = size(entryJs);
  const css = size(entryCss);

  const markers = { katex: /KaTeX parse error/, highlighter: /hljs-|registerLanguage/, mermaid: /securityLevel|flowchart-v2/ };
  const inEntry = Object.fromEntries(Object.entries(markers).map(([name, marker]) => [name, marker.test(js.text)]));
  const lazy = {
    katex: files.filter((file) => /^katex(Plugin)?-.*\.js$/.test(file)),
    highlighter: files.filter((file) => /^highlighter-.*\.js$/.test(file)),
    mermaid: files.filter((file) => /^mermaid\.core-.*\.js$/.test(file)),
    chat: files.filter((file) => /^ChatList-.*\.js$/.test(file)),
  };
  await verify([9], "`vite build` 后检查 dist/assets 的入口 chunk（index-*.js）和懒加载 chunk", "入口 chunk 里没有 KaTeX、代码高亮、Mermaid；三者和对话列表各有独立的懒加载 chunk；入口体积相对 main@e86cd19 的增量写入 measurements", async () => {
    expect(inEntry).toEqual({ katex: false, highlighter: false, mermaid: false }); // B1
    for (const chunks of Object.values(lazy)) expect(chunks.length).toBeGreaterThan(0); // B2
    return `入口 chunk 含 KaTeX ${inEntry.katex}、高亮 ${inEntry.highlighter}、Mermaid ${inEntry.mermaid}；懒加载 chunk 存在：${Object.entries(lazy).map(([name, chunks]) => `${name} ${chunks.length > 0}`).join("，")}`;
  });

  const lazyGzip = Object.fromEntries(Object.entries(lazy).map(([name, chunks]) => [name, chunks.reduce((sum, file) => sum + size(file).gzip, 0)]));
  await metrics({
    initialBundle: {
      base: BASE.ref,
      entryJs: { bytes: js.bytes, gzip: js.gzip, deltaBytes: js.bytes - BASE.entryJs, deltaGzip: js.gzip - BASE.entryJsGzip },
      entryCss: { bytes: css.bytes, gzip: css.gzip, deltaBytes: css.bytes - BASE.entryCss, deltaGzip: css.gzip - BASE.entryCssGzip },
      lazyChunksGzip: lazyGzip,
      rendererInEntry: inEntry,
    },
  });
});
