import { memo, useMemo } from "react";
import { CopyButton } from "../CopyButton";
import { highlighterModule, useLazyModule } from "./lazy";

export const CodeBlock = memo(function CodeBlock({ code, language, note }: { code: string; language: string; note?: string }) {
  const highlight = useLazyModule(highlighterModule, Boolean(language));
  const body = useMemo(() => (highlight ? highlight(code, language) : code), [highlight, code, language]);
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
