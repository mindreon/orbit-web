import { Button } from "../../ui/Button";
import { Section, SectionEmpty } from "./Section";

interface ApprovalInboxProps {
  readonly approvals: readonly string[];
  readonly onDecide: (approvalId: string, decision: "approve" | "reject") => void;
}

export function ApprovalInbox({ approvals, onDecide }: ApprovalInboxProps) {
  return (
    <Section title="审批收件箱" label="审批收件箱">
      {approvals.length === 0 ? <SectionEmpty>暂无待审批项</SectionEmpty> : approvals.map((approval) => (
        <div key={approval} data-testid="approval-item" className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
          <p className="break-all">{approval}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => onDecide(approval, "approve")}>批准</Button>
            <Button size="sm" variant="danger" onClick={() => onDecide(approval, "reject")}>拒绝</Button>
          </div>
        </div>
      ))}
    </Section>
  );
}
