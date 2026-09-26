import { memo, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";
import { Check, Copy } from "lucide-react";

const lowlight = createLowlight(common);

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", js: "javascript", ts: "typescript", py: "python", yml: "yaml", md: "markdown", golang: "go" };

function highlight(code: string, language: string) {
  const lang = ALIASES[language] ?? language;
  if (!lang || !lowlight.registered(lang)) return code;
  return toJsxRuntime(lowlight.highlight(lang, code), { Fragment, jsx, jsxs });
}

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#666] hover:bg-black/5"
      onClick={() => {
        const reset = () => setTimeout(() => setState("idle"), 1500);
        if (!navigator.clipboard) {
          setState("failed");
          reset();
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => setState("done"),
          () => setState("failed"),
        ).finally(reset);
      }}
    >
      {state === "done" ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {state === "done" ? "已复制" : state === "failed" ? "复制失败" : label}
    </button>
  );
}

export const CodeBlock = memo(function CodeBlock({ code, language, note }: { code: string; language: string; note?: string }) {
  const body = useMemo(() => highlight(code, language), [code, language]);
  return (
    <div className="md-code group">
      <div className="md-code-bar">
        <span>{language || "text"}{note ? ` · ${note}` : ""}</span>
        <CopyButton text={code} label="复制代码" />
      </div>
      <pre>
        <code className={language ? `hljs language-${language}` : "hljs"}>{body}</code>
      </pre>
    </div>
  );
});
