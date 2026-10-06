import { memo, useEffect, useMemo, useRef, useState } from "react";
import { WrapText } from "lucide-react";
import { cn } from "../../lib/cn";
import { CopyButton } from "./CopyButton";
import { highlighterModule, useLazyModule } from "./lazy";

/** While a block is still being written, highlighting runs at most this often instead of on every delta. */
const SETTLE_MS = 120;

/**
 * The part of a growing block that has been highlighted. It trails `code` by at most SETTLE_MS (a throttle, not a
 * debounce: a steady stream must still make progress). Once the block stops growing, `code` itself is returned.
 */
function useSettledCode(code: string, live: boolean) {
  const [settled, setSettled] = useState(code);
  const latest = useRef(code);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    latest.current = code;
    if (!live || timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setSettled(latest.current);
    }, SETTLE_MS);
  }, [code, live]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    },
    [],
  );
  if (!live || !code.startsWith(settled)) return code;
  return settled;
}

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-control text-muted-foreground hover:bg-gray-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A code block: a 36px header (language, wrap toggle, copy) over a body that scrolls sideways by default.
 * `live` means the fence is still open in a streaming message: the highlighted prefix is kept and only the new tail is plain.
 * Memoised on (code, language, note, live) so a finished block is not re-rendered by later deltas.
 */
export const CodeBlock = memo(function CodeBlock({ code, language, note, live = false }: { code: string; language: string; note?: string; live?: boolean }) {
  const [wrapped, setWrapped] = useState(false);
  const highlight = useLazyModule(highlighterModule, Boolean(language));
  const settled = useSettledCode(code, live);
  const head = useMemo(() => (highlight ? highlight(settled, language) : settled), [highlight, settled, language]);
  const tail = code.slice(settled.length);
  return (
    <div data-testid="code-block" data-language={language || "text"} className="md-code group overflow-hidden rounded-card bg-muted">
      <div className="flex h-9 items-center justify-between bg-gray-100 pl-3 pr-1.5">
        <span className="min-w-0 truncate font-mono text-caption text-muted-foreground">
          {language || "text"}
          {note ? ` · ${note}` : ""}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" aria-label="自动换行" title="自动换行" aria-pressed={wrapped} className={cn(iconButton, wrapped && "bg-gray-200 text-foreground")} onClick={() => setWrapped((value) => !value)}>
            <WrapText className="h-4 w-4" aria-hidden />
          </button>
          <CopyButton text={code} label="复制代码" />
        </div>
      </div>
      <pre data-testid="code-body" data-wrapped={wrapped} className={cn("m-0 overflow-x-auto px-4 py-3 font-mono text-small leading-relaxed", wrapped ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre")}>
        <code className={cn("bg-transparent p-0 [font-variant-ligatures:none]", language ? `hljs language-${language}` : "hljs")}>
          {head}
          {tail}
        </code>
      </pre>
    </div>
  );
});
