import { ShieldAlert } from "lucide-react";
import { ruleText, type ApprovalInfo } from "../../lib/approvals";
import { Button } from "../../ui/Button";

interface ApprovalInboxProps {
  readonly approvals: readonly string[];
  readonly infos: Readonly<Record<string, ApprovalInfo>>;
  readonly onDecide: (approvalId: string, decision: "approve" | "reject", always: boolean) => void;
}

/** 需要你确认的操作，直接出现在对话最下面，不用去别处找。说明是什么操作，再给三个选择：允许一次、本任务内总是允许、拒绝。 */
export function ApprovalInbox({ approvals, infos, onDecide }: ApprovalInboxProps) {
  if (approvals.length === 0) return null;
  return (
    <section aria-label="审批收件箱" className="space-y-2">
      {approvals.map((approval) => {
        const info = infos[approval];
        return (
          <div key={approval} data-testid="approval-item" className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldAlert aria-hidden="true" className="h-4 w-4 text-warning" />
              需要你的确认
              {info?.tool ? <span className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-foreground/80">{info.tool}</span> : null}
            </p>
            {info?.detail ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card px-3 py-2 font-mono text-xs text-foreground">{info.detail}</pre> : null}
            {info ? null : <p className="mt-1 break-all text-xs text-muted-foreground">{approval}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => onDecide(approval, "approve", false)}>允许一次</Button>
              {info?.rule ? (
                <Button size="sm" title={`本任务内以后都允许：${ruleText(info.rule)}`} onClick={() => onDecide(approval, "approve", true)}>
                  本任务总是允许
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={() => onDecide(approval, "reject", false)}>拒绝</Button>
            </div>
            {info?.rule ? <p className="mt-2 text-xs text-muted-foreground">总是允许：{ruleText(info.rule)}，只在这个任务里有效。</p> : null}
            {info && !info.rule ? <p className="mt-2 text-xs text-muted-foreground">这个操作每次都需要你确认，不能设为总是允许。</p> : null}
          </div>
        );
      })}
    </section>
  );
}
