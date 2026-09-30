import { ShieldAlert } from "lucide-react";
import { Button } from "../../ui/Button";

interface ApprovalInboxProps {
  readonly approvals: readonly string[];
  readonly onDecide: (approvalId: string, decision: "approve" | "reject") => void;
}

/** 需要你确认的操作，直接出现在对话最下面，不用去别处找。 */
export function ApprovalInbox({ approvals, onDecide }: ApprovalInboxProps) {
  if (approvals.length === 0) return null;
  return (
    <section aria-label="审批收件箱" className="space-y-2">
      {approvals.map((approval) => (
        <div key={approval} data-testid="approval-item" className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldAlert aria-hidden="true" className="h-4 w-4 text-warning" />
            需要你的确认
          </p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{approval}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => onDecide(approval, "approve")}>批准</Button>
            <Button size="sm" variant="danger" onClick={() => onDecide(approval, "reject")}>拒绝</Button>
          </div>
        </div>
      ))}
    </section>
  );
}
