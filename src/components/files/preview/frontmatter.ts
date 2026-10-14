/**
 * Markdown from expert and skill files often starts with YAML frontmatter (`--- name: x description: y ---`), sometimes with
 * its line breaks collapsed. Returns the text after it; when nothing follows, the frontmatter's own description.
 */
export function stripFrontmatter(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return text.trim();
  const rest = trimmed.slice(3);
  const close = /(^|\s)---(?=\s|$)/.exec(rest);
  const block = close ? rest.slice(0, close.index) : rest;
  const body = close ? rest.slice(close.index + close[0].length).trim() : "";
  if (body !== "") return body;
  const description = /(?:^|\s)description:\s*(.*?)\s*$/s.exec(block)?.[1] ?? "";
  // A multi-line block ends the description at the next key; a collapsed one has nothing after it.
  return description.split(/\n\s*[A-Za-z_-]+:\s/)[0].trim();
}
