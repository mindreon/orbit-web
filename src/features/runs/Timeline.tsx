import { Check, CircleMinus, LoaderCircle } from "lucide-react";
import type { Decision, Message, S } from "../../api/types";
import type { RunStreamState, TimelineOrder, TimelineTool } from "../../api/timeline";
import { Markdown } from "../../components/markdown/Markdown";
import { InteractionCard, EffectChip } from "../interactions";
export function UserBubble({ text }: { text: string }) { return <div className="flex justify-end"><p className="max-w-[80%] whitespace-pre-wrap break-words rounded-bubble bg-gray-100 px-4 py-2.5 text-body">{text}</p></div>; }
function ToolCard({ tool, terminal }: { tool: TimelineTool; terminal: boolean }) {
  return <details open={tool.result?.ok === false || undefined} className="rounded-card bg-gray-50 px-3"><summary className="flex min-h-10 cursor-pointer items-center gap-2"><span className="min-w-0 truncate font-mono text-small">{tool.call?.tool ?? "工具调用"}</span>{tool.call ? <EffectChip effect={tool.call.effect_class} /> : null}<span className="ml-auto text-small">{!tool.result ? terminal ? <CircleMinus aria-label="未完成" className="h-4 w-4 text-muted-foreground" /> : <LoaderCircle aria-label="运行中" className="h-4 w-4 text-muted-foreground" /> : tool.result.ok ? <Check aria-label="成功" className="h-4 w-4 text-success-500" /> : <span className="text-danger-700">失败</span>}</span></summary><div className="space-y-3 pb-3"><ToolBlock label="参数" text={tool.call?.args_preview ?? ""} /><ToolBlock label="结果" text={tool.result?.preview ?? ""} />{tool.output ? <ToolBlock label="沙箱输出" text={tool.output} /> : null}</div></details>;
}
function ToolBlock({ label, text }: { label: string; text: string }) { return <div><p className="mb-1 text-small text-muted-foreground">{label}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-caption">{text.split("\n").slice(0, 12).join("\n")}</pre>{text.split("\n").length > 12 ? <details><summary className="cursor-pointer text-caption text-muted-foreground">展开全部</summary><pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-caption">{text}</pre></details> : null}</div>; }
export function Timeline({ state, runStatus, interactions, principalId, onResolve, readOnly = false, userMessages = [], member }: {
  state: RunStreamState; runStatus?: S["RunState"]; interactions: readonly S["Interaction"][]; principalId: string;
  onResolve(item: S["Interaction"], decision: Decision): Promise<void>; readOnly?: boolean; userMessages?: readonly Message[]; member?: string;
}) {
  const terminal = ["cancelled", "failed", "timed_out", "budget_exhausted", "succeeded"].includes(runStatus ?? state.status ?? "");
  const order: (TimelineOrder | { kind: "user"; key: string; message: Message })[] = state.order.filter((item) => !member || item.member === member);
  // Keep event arrival order intact; only insert persisted user messages between timestamped entries.
  for (const message of [...userMessages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const next = order.findIndex((item) => item.kind !== "user" && item.ts && Date.parse(item.ts) > Date.parse(message.created_at));
    order.splice(next < 0 ? order.length : next, 0, { kind: "user", key: message.id, message });
  }
  return <div className="space-y-2">{order.map((item) => <div key={`${item.kind}:${item.key}`} data-timeline-member={item.kind === "user" ? undefined : item.member}>{renderItem(item)}</div>)}</div>;
  function renderItem(item: typeof order[number]) {
    if (item.kind === "user") return <UserBubble key={`user:${item.key}`} text={item.message.text ?? ""} />;
    if (item.kind === "message") {
      const message = state.messages.find((entry) => `${entry.member}#${entry.segment}#${entry.messageId}` === item.key);
      if (!message) return null;
      return <div key={`message:${item.key}`} className="break-words text-body leading-7">{message.reasoning ? <details className="mb-2 text-small text-muted-foreground"><summary className="cursor-pointer">思考过程</summary><div className="whitespace-pre-wrap text-gray-600">{message.reasoning}</div></details> : null}<Markdown text={message.text} />{!message.final ? <span aria-label="正在生成" className="inline-block h-4 w-0.5 animate-[md-caret_1s_steps(2,start)_infinite] bg-primary-500" /> : null}{message.contentRef ? <p className="text-caption text-muted-foreground">内容过长，已截断显示</p> : null}</div>;
    }
    if (item.kind === "tool") { const tool = state.tools.get(item.key); return tool ? <ToolCard key={`tool:${item.key}`} tool={tool} terminal={terminal} /> : null; }
    if (item.kind === "team") { const message = state.teamMessages.find((entry) => entry.message_id === item.key); return message ? <details key={`team:${item.key}`} className="ml-4 text-small"><summary className="cursor-pointer truncate text-gray-500">{message.from} → {message.to}</summary><p className="whitespace-pre-wrap">{message.text}</p></details> : null; }
    const interaction = state.interactions.get(item.key);
    const resource = interactions.find((entry) => entry.request.interaction_id === item.key);
    const request = resource?.request ?? interaction?.request?.interaction;
    if (!request) return null;
    const resolution = interaction?.resolution ?? (resource?.decision ? { decision: resource.decision, actor: resource.decided_by ?? "" } : undefined);
    return <div key={`interaction:${item.key}`} id={`interaction-${item.key}`}><InteractionCard request={request} approvers={readOnly ? [] : resource?.approvers ?? []} principalId={principalId} status={resource?.status} expiresAt={resource?.expires_at ?? interaction?.request?.expires_at} resolution={resolution} onResolve={(decision) => resource ? onResolve(resource, decision) : Promise.reject(new Error("正在加载审批信息"))} /></div>;
  }
}
