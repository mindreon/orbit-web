import { memo } from "react";
import type { TimelineItem } from "../lib/events/timeline";
import { FailureCard } from "./FailureCard";
import { Markdown } from "./markdown/Markdown";
import { CopyButton } from "./CopyButton";
import { ToolGroup, sameCall } from "./ToolRow";

function agentLabel(agentPath: string) {
  return agentPath && agentPath !== "main" ? `子助手 · ${agentPath}` : "助手";
}

function highlightNodes(text: string, needle: string) {
  if (!needle || !text.includes(needle)) return text;
  return text.split(needle).flatMap((part, index) => (index === 0 ? [part] : [<mark key={index} className="md-mark">{needle}</mark>, part]));
}

export interface ChatItemProps {
  item: TimelineItem;
  highlight: string;
  focused: boolean;
  retryDisabled: boolean;
  onRetry: (text: string) => void;
}

function ChatItemView({ item, highlight, focused, retryDisabled, onRetry }: ChatItemProps) {
  if (item.kind === "user") {
    return (
      <div data-testid="chat-item" data-kind="user" data-item-id={item.id} className="group flex flex-col items-end">
        <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#f1f2f4] px-3.5 py-2 text-sm leading-6 ${focused ? "ring-2 ring-[#ffe08a]" : ""}`}>
          {item.steered ? <span className="mr-1.5 rounded bg-white px-1 py-0.5 text-[11px] text-[#888]">接着说</span> : null}
          {highlightNodes(item.text, highlight)}
        </div>
        <div className="mt-0.5 h-5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton text={item.text} />
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <article data-testid="chat-item" data-kind="assistant" data-item-id={item.id} className={`group ${focused ? "rounded-lg ring-2 ring-[#ffe08a] ring-offset-4" : ""}`}>
        <p className="mb-1 text-xs text-[#999]">{agentLabel(item.agentPath)}</p>
        <Markdown text={item.text} highlight={highlight} />
        <div className="mt-1 flex gap-2 text-xs text-[#666] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton text={item.text} />
          <button type="button" disabled aria-disabled="true" className="cursor-not-allowed text-[11px] text-[#b0b0b0]">
            提交反馈 · 未接入
          </button>
        </div>
      </article>
    );
  }
  if (item.kind === "draft") {
    return (
      <article data-kind="draft" data-item-id={item.id} aria-live="polite" aria-busy="true">
        <p className="mb-1 text-xs text-[#999]">{agentLabel(item.agentPath)} · 正在输入</p>
        <div data-testid="assistant-draft" className="md-streaming">
          <Markdown text={item.text} streaming />
        </div>
      </article>
    );
  }
  if (item.kind === "tools") {
    return (
      <div data-testid="chat-item" data-kind="tools" data-item-id={item.id}>
        <ToolGroup calls={item.calls} />
      </div>
    );
  }
  return (
    <div data-testid="chat-item" data-kind="failure" data-item-id={item.id}>
      <FailureCard errorCode={item.errorCode} retryable={item.retryable} retryText={item.retryText} disabled={retryDisabled} onRetry={onRetry} />
    </div>
  );
}

function sameItem(a: TimelineItem, b: TimelineItem) {
  if (a.kind !== b.kind || a.id !== b.id) return false;
  if (a.kind === "tools" && b.kind === "tools") return a.calls.length === b.calls.length && a.calls.every((call, index) => sameCall(call, b.calls[index]));
  if (a.kind === "failure" && b.kind === "failure") return a.retryText === b.retryText;
  if ("text" in a && "text" in b) return a.text === b.text;
  return false;
}

export const ChatItem = memo(
  ChatItemView,
  (a, b) => a.highlight === b.highlight && a.focused === b.focused && a.retryDisabled === b.retryDisabled && a.onRetry === b.onRetry && sameItem(a.item, b.item),
);
