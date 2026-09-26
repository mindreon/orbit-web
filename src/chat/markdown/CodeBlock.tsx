import { memo, useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";
import { CopyButton } from "../CopyButton";

const lowlight = createLowlight(common);

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", js: "javascript", ts: "typescript", py: "python", yml: "yaml", md: "markdown", golang: "go" };

function highlight(code: string, language: string) {
  const lang = ALIASES[language] ?? language;
  if (!lang || !lowlight.registered(lang)) return code;
  return toJsxRuntime(lowlight.highlight(lang, code), { Fragment, jsx, jsxs });
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
