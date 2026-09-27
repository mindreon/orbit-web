import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", js: "javascript", ts: "typescript", py: "python", yml: "yaml", md: "markdown", golang: "go" };

/** Highlight only: returns React nodes for display. Code is never evaluated. */
export function highlight(code: string, language: string) {
  const lang = ALIASES[language] ?? language;
  if (!lang || !lowlight.registered(lang)) return code;
  return toJsxRuntime(lowlight.highlight(lang, code), { Fragment, jsx, jsxs });
}
