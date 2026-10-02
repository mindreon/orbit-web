/**
 * Some models write their reasoning into the reply instead of the field made for it: `<think>…</think>`, or only the
 * closing tag, because the opening one was part of the prompt. This splits a piece of reply (one model round) into
 * what is reasoning and what is the answer. A tag that is still arriving is held back, so it never flashes.
 */
const OPEN = "<think>";
const CLOSE = "</think>";

export interface Split {
  readonly thinking: string;
  readonly answer: string;
}

/** The end of `text` that could be the start of a tag that has not fully arrived. */
function partialTagLength(text: string): number {
  for (const tag of [OPEN, CLOSE]) {
    for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
      if (text.endsWith(tag.slice(0, length))) return length;
    }
  }
  return 0;
}

export function splitThinking(text: string): Split {
  let thinking = "";
  let answer = "";
  let rest = text;
  let inside = false;
  for (;;) {
    const open = inside ? -1 : rest.indexOf(OPEN);
    const close = rest.indexOf(CLOSE);
    if (open === -1 && close === -1) break;
    if (open !== -1 && (close === -1 || open < close)) {
      answer += rest.slice(0, open);
      rest = rest.slice(open + OPEN.length);
      inside = true;
    } else if (inside) {
      thinking += rest.slice(0, close);
      rest = rest.slice(close + CLOSE.length);
      inside = false;
    } else {
      // A closing tag nobody opened: everything before it, in this round, was reasoning.
      thinking += answer + rest.slice(0, close);
      answer = "";
      rest = rest.slice(close + CLOSE.length);
    }
  }
  const held = partialTagLength(rest);
  const visible = rest.slice(0, rest.length - held);
  return inside ? { thinking: thinking + visible, answer } : { thinking, answer: answer + visible };
}

/** Rounds side by side: the reasoning of all of them, and the answers of all of them. */
export function joinSplits(parts: readonly Split[]): Split {
  const gather = (pick: (split: Split) => string) => parts.map(pick).map((text) => text.trim()).filter(Boolean).join("\n\n");
  return { thinking: gather((split) => split.thinking), answer: gather((split) => split.answer) };
}
