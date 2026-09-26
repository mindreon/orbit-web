import { memo, useEffect, useId, useState } from "react";
import DOMPurify from "dompurify";
import type { Mermaid } from "mermaid";
import { scheduleFrame } from "../../lib/frame";
import { CodeBlock } from "./CodeBlock";

let loader: Promise<Mermaid> | null = null;

/** Mermaid is large, so it loads on first use as its own chunk. */
function loadMermaid() {
  loader ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return loader;
}

type View = { kind: "pending" } | { kind: "svg"; svg: string } | { kind: "error" };

export const MermaidBlock = memo(function MermaidBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const rawId = useId();
  const [view, setView] = useState<View>({ kind: "pending" });

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    const id = `mmd-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    setView({ kind: "pending" });
    loadMermaid()
      .then(async (mermaid) => {
        await mermaid.parse(code);
        const { svg } = await mermaid.render(id, code);
        // Mermaid's strict mode already sanitizes; this second pass keeps model output from ever reaching the DOM unsanitized.
        const clean = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true, html: true },
          ADD_TAGS: ["foreignObject"],
        });
        scheduleFrame(() => {
          if (!cancelled) setView({ kind: "svg", svg: clean });
        });
      })
      .catch(() => {
        document.getElementById(`d${id}`)?.remove();
        scheduleFrame(() => {
          if (!cancelled) setView({ kind: "error" });
        });
      });
    return () => {
      cancelled = true;
    };
  }, [code, streaming, rawId]);

  if (streaming) return <CodeBlock code={code} language="mermaid" note="生成中" />;
  if (view.kind === "error") return <CodeBlock code={code} language="mermaid" note="图无法渲染，显示源码" />;
  if (view.kind === "pending") {
    return <div className="md-mermaid text-muted-foreground text-xs">正在绘制图表…</div>;
  }
  return <div className="md-mermaid" role="img" aria-label="Mermaid 图" dangerouslySetInnerHTML={{ __html: view.svg }} />;
});
