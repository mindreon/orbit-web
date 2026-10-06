import { memo, useEffect, useId, useState, useSyncExternalStore } from "react";
import DOMPurify from "dompurify";
import type { Mermaid } from "mermaid";
import { scheduleFrame } from "../../lib/frame";
import { CodeBlock } from "./CodeBlock";

let loader: Promise<Mermaid> | null = null;

/** Mermaid is large, so it loads on first use as its own chunk. */
function loadMermaid() {
  loader ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  return loader;
}

type ThemeName = "dark" | "neutral";

const readTheme = (): ThemeName => (document.documentElement.dataset.theme === "dark" ? "dark" : "neutral");

/** The diagram follows the app theme: the neutral palette is dark text on a light page and unreadable on the dark one. */
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

type View = { kind: "pending" } | { kind: "svg"; svg: string } | { kind: "error" };

/**
 * Draws only a finished diagram: its fence is closed (`closed`) and its block is no longer being streamed. Until then,
 * and when the diagram cannot be drawn, the source shows as a code block.
 */
export const MermaidBlock = memo(function MermaidBlock({ code, streaming, closed }: { code: string; streaming: boolean; closed: boolean }) {
  const rawId = useId();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "neutral" as const);
  const [view, setView] = useState<View>({ kind: "pending" });
  const ready = closed && !streaming;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const id = `mmd-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    setView({ kind: "pending" });
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          fontFamily: "inherit",
        });
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
  }, [code, ready, theme, rawId]);

  if (!ready) return <CodeBlock code={code} language="mermaid" note={streaming ? "生成中" : undefined} live={streaming && !closed} />;
  if (view.kind === "error") return <CodeBlock code={code} language="mermaid" note="图无法渲染，显示源码" />;
  // Keep the source on screen until the diagram is ready, so the block changes once instead of flashing a placeholder.
  if (view.kind === "pending") return <CodeBlock code={code} language="mermaid" note="正在绘制图表" />;
  return <div data-testid="mermaid" className="md-mermaid" role="img" aria-label="Mermaid 图" dangerouslySetInnerHTML={{ __html: view.svg }} />;
});
