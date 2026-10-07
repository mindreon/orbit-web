import { useMemo } from "react";
import { highlight } from "../../markdown/highlighter";
import { languageOf } from "./registry";
import type { PreviewProps } from "./types";

/** Past this size highlighting would stall the page, so the text is shown as is. */
const MAX_HIGHLIGHT = 300 * 1024;

export default function CodePreview({ name, text = "", language }: PreviewProps) {
  const lang = language ?? languageOf(name);
  const body = useMemo(() => (lang && text.length <= MAX_HIGHLIGHT ? highlight(text, lang) : text), [text, lang]);
  return (
    <pre className="m-0 min-h-full overflow-x-auto p-5 font-mono text-caption leading-relaxed">
      <code data-testid="code-preview" data-language={lang || "text"} className={lang ? `hljs language-${lang} bg-transparent p-0 [font-variant-ligatures:none]` : "hljs bg-transparent p-0"}>
        {body}
      </code>
    </pre>
  );
}
