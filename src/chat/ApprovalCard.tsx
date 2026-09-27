import { memo, useState } from "react";
import { ChevronRight, CircleCheck, CircleSlash, ShieldAlert } from "lucide-react";
import { cn } from "../lib/cn";
import type { Approval } from "../lib/rooms";
import type { ApprovalCardView } from "../lib/events/timeline";
import { describeTool, toolTitle } from "../lib/events/toolLabels";

const RISK_TEXT: Record<string, string> = {
  read: "只读取",
  write: "会写入",
  sensitive: "涉及敏感信息",
  destructive: "不可撤销",
};

type Decision = { allowed: boolean | null; by: string };

function readDecision(card: ApprovalCardView, control: Approval | undefined): Decision | null {
  const raw = card.outcome ?? (control && control.status !== "pending" ? (control.decision ?? control.status) : null);
  if (!raw) return null;
  const value = raw.toLowerCase();
  const allowed = value.startsWith("allow") || value === "approved" ? true : value.startsWith("reject") || value === "denied" ? false : null;
  return { allowed, by: card.decidedBy };
}

export function findControlApproval(card: ApprovalCardView, approvals: readonly Approval[]) {
  return approvals.find(
    (item) => (card.approvalId && item.id === card.approvalId) || (card.approvalRequestId && item.approvalRequestId === card.approvalRequestId),
  );
}

export function approvalFromControl(item: Approval): ApprovalCardView {
  return {
    kind: "approval",
    id: `approval-${item.id}`,
    key: item.id,
    sequence: 0,
    stopped: false,
    callId: "",
    approvalId: item.id,
    approvalRequestId: item.approvalRequestId ?? "",
    toolName: item.toolName ?? "",
    argsPreview: "",
    reason: item.reason ?? "",
    risk: "",
    agentPath: "main",
    outcome: null,
    decidedBy: "",
  };
}

/**
 * One card per call, shown where the approval was asked. Buttons exist only while the approval is pending;
 * after a decision the card stays in place, read-only.
 */
export const ApprovalCard = memo(function ApprovalCard({
  card,
  approvals,
  disabled,
  onDecide,
}: {
  card: ApprovalCardView;
  approvals: readonly Approval[];
  disabled: boolean;
  onDecide: (approvalId: string, decision: "allow" | "reject") => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const control = findControlApproval(card, approvals);
  const decision = readDecision(card, control);
  const settled = decision !== null || card.stopped;
  const approvalId = control?.id || card.approvalId;
  const label = describeTool(card.toolName, card.argsPreview);
  const risk = card.risk ? RISK_TEXT[card.risk] : "";

  return (
    <div
      data-testid="approval-card"
      data-state={decision ? "decided" : card.stopped ? "stopped" : "pending"}
      className={cn("max-w-2xl rounded-lg border px-3 py-2.5 text-sm", settled ? "border-[#ececee] bg-[#fafafb]" : "border-amber-200 bg-amber-50/60")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ShieldAlert className={cn("h-4 w-4", settled ? "text-[#999]" : "text-amber-600")} aria-hidden />
        <span className="font-semibold text-[#222]">{settled ? "确认记录" : "这一步要先确认"}</span>
        {card.agentPath && card.agentPath !== "main" ? <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#666]">子助手 · {card.agentPath}</span> : null}
        {risk ? <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-amber-700">{risk}</span> : null}
      </div>
      <p className="mt-1.5 leading-6 text-[#222]">
        助手要{toolTitle(label)}。{card.reason ? <span className="text-[#555]">{card.reason}</span> : null}
      </p>
      {decision ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#555]" data-testid="approval-decision">
          {decision.allowed === false ? <CircleSlash className="h-3.5 w-3.5 text-amber-600" aria-hidden /> : <CircleCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
          {decision.allowed === true ? "已允许这一次" : decision.allowed === false ? "已拒绝" : "已处理"}
          {decision.by ? <span className="text-[#999]">· {decision.by}</span> : null}
        </p>
      ) : card.stopped ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#555]" data-testid="approval-decision">
          <CircleSlash className="h-3.5 w-3.5 text-[#999]" aria-hidden />
          任务已停止，这一步没有执行
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || !approvalId}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => approvalId && onDecide(approvalId, "allow")}
          >
            允许这一次
          </button>
          <button
            type="button"
            disabled={disabled || !approvalId}
            className="inline-flex h-8 items-center rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-[#f6f6f7] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => approvalId && onDecide(approvalId, "reject")}
          >
            拒绝
          </button>
          {!approvalId ? <span className="text-[11px] text-[#999]">正在同步批准状态…</span> : null}
        </div>
      )}
      <button type="button" aria-expanded={detailOpen} className="mt-2 inline-flex items-center gap-0.5 text-[11px] text-[#999]" onClick={() => setDetailOpen((value) => !value)}>
        <ChevronRight className={cn("h-3 w-3 transition-transform", detailOpen && "rotate-90")} aria-hidden />
        技术详情
      </button>
      {detailOpen ? (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-white px-2 py-1.5 font-mono text-[11px] text-[#555]">
          {[`tool: ${card.toolName || "未知"}`, card.argsPreview ? `args: ${card.argsPreview}` : "", card.callId ? `callId: ${card.callId}` : ""].filter(Boolean).join("\n")}
        </pre>
      ) : null}
    </div>
  );
});
