interface ApprovalInboxProps {
  readonly approvals: readonly string[];
  readonly onDecide: (approvalId: string, decision: "approve" | "reject") => void;
}

export function ApprovalInbox({ approvals, onDecide }: ApprovalInboxProps) {
  return (
    <section aria-label="审批收件箱" className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">审批收件箱</h3>
      {approvals.length === 0 ? <p className="mt-2 text-xs text-slate-400">暂无待审批项</p> : approvals.map((approval) => (
        <div key={approval} data-testid="approval-item" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p>{approval}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onDecide(approval, "approve")} className="rounded border border-emerald-300 px-2 py-1 text-emerald-700">批准</button>
            <button type="button" onClick={() => onDecide(approval, "reject")} className="rounded border border-red-300 px-2 py-1 text-red-700">拒绝</button>
          </div>
        </div>
      ))}
    </section>
  );
}
