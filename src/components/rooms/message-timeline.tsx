"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GitMerge, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { activityLabel } from "@/lib/rooms-ui";
import type { ActivityEvent, Approval, ChatMessage } from "@/lib/control";

type Props = {
  messages: ChatMessage[];
  activity: ActivityEvent[];
  pendingApprovals: Approval[];
  busy?: boolean;
  focusAgentId?: string | null;
  planPending?: string | null;
  onConfirmPlan?: () => void;
  onDecide: (id: string, decision: "allow" | "reject") => void;
};

export function MessageTimeline({
  messages,
  activity,
  pendingApprovals,
  busy,
  focusAgentId,
  planPending,
  onConfirmPlan,
  onDecide,
}: Props) {
  const steps = activity.filter((item) =>
    [
      "tool.call",
      "tool.result",
      "session.status",
      "agent.started",
      "agent.finished",
      "room.steered",
    ].includes(item.type),
  );

  const filteredSteps = focusAgentId
    ? steps.filter(
        (item) =>
          item.callId === focusAgentId ||
          item.turnId === focusAgentId ||
          item.type === "room.steered",
      )
    : steps;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-1 py-2">
      {pendingApprovals.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-amber-200 bg-warning-soft p-3 text-sm"
        >
          <p className="font-semibold text-warning-foreground">
            需要审批：{item.toolName}
          </p>
          {item.reason ? (
            <p className="mt-1 text-muted-foreground">{item.reason}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide(item.id, "allow")}>
              允许这一次
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide(item.id, "reject")}
            >
              拒绝并停止
            </Button>
          </div>
        </div>
      ))}

      {planPending ? (
        <div className="rounded-lg border border-primary/20 bg-primary-softer p-3 text-sm">
          <div className="mb-2">
            <Tag color="processing">计划待确认</Tag>
          </div>
          <p className="whitespace-pre-wrap text-foreground">{planPending}</p>
          <Button className="mt-3" size="sm" disabled={busy} onClick={onConfirmPlan}>
            按计划执行
          </Button>
        </div>
      ) : null}

      {messages.length === 0 && !planPending ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          发送任务后，阶段说明、工具步骤与回复会出现在这里。
        </p>
      ) : (
        messages.map((msg) => (
          <article
            key={msg.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2.5 text-sm",
              msg.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground",
            )}
          >
            <div
              className={cn(
                "mb-1 text-xs",
                msg.role === "user"
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground",
              )}
            >
              {msg.role === "user" ? "你" : "Orbit Agent"}
            </div>
            <p className="whitespace-pre-wrap">{msg.text}</p>
          </article>
        ))
      )}

      {filteredSteps.map((item) => (
        <StepCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function StepCard({ item }: { item: ActivityEvent }) {
  const [open, setOpen] = useState(false);
  const isDelegation = item.type === "agent.started";
  const isMerge = item.type === "agent.finished";

  if (isDelegation || isMerge) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          {isDelegation ? (
            <UserPlus className="size-4 text-primary" aria-hidden />
          ) : (
            <GitMerge className="size-4 text-success" aria-hidden />
          )}
          <span className="font-medium text-foreground">
            {isDelegation ? "委派" : "汇合"}
          </span>
          <Tag color={isDelegation ? "processing" : "success"}>
            {isDelegation ? "子 Agent 观察中" : "已完成"}
          </Tag>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          仅观察 · 不可单独暂停/取消 · {new Date(item.occurredAt).toLocaleTimeString()}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground">{activityLabel(item)}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          #{item.sequence} · {new Date(item.occurredAt).toLocaleTimeString()}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <p>
            {item.source} · {item.type}
            {item.toolName ? ` · ${item.toolName}` : ""}
          </p>
          {item.reason ? <p className="mt-1">{item.reason}</p> : null}
          {item.text ? <p className="mt-1 whitespace-pre-wrap">{item.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
