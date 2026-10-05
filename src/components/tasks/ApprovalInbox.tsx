import { ArrowRightLeft, ClipboardCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { humanizeProfileRefs } from "../../lib/display";
import { ruleText, type ApprovalInfo } from "../../lib/approvals";
import { Attention } from "../../ui/Attention";
import { Button } from "../../ui/Button";

interface ApprovalInboxProps {
  readonly approvals: readonly string[];
  /** 审批所属的尝试被打断或取消了：不再等你，只留一张说明。 */
  readonly cancelled?: readonly string[];
  readonly infos: Readonly<Record<string, ApprovalInfo>>;
  /** 步骤 id 到标题，切换专家的审批用它说明是哪一步。 */
  readonly nodeTitles?: Readonly<Record<string, string>>;
  /** 专家引用（id@版本）到显示名，切换专家的审批不显示引用。 */
  readonly nameOf?: (ref: string) => string;
  readonly onDecide: (approvalId: string, decision: "approve" | "reject", always: boolean) => void;
}

/** 需要你确认的操作，直接出现在对话最下面，不用去别处找。说明是什么操作，再给三个选择：允许一次、本任务内总是允许、拒绝。 */
export function ApprovalInbox({ approvals, cancelled = [], infos, nodeTitles = {}, nameOf = (ref) => ref, onDecide }: ApprovalInboxProps) {
  if (approvals.length === 0 && cancelled.length === 0) return null;
  return (
    <section aria-label="审批收件箱" className="space-y-3">
      {cancelled.map((approval) => {
        const info = infos[approval];
        return (
          // 已经不用你处理的，安静地待着：灰底、没有强调条。
          <div key={approval} data-testid="approval-item" data-state="cancelled" className="rounded-card bg-muted p-4">
            <p className="flex items-center gap-2 text-body font-medium text-muted-foreground">
              <ShieldOff aria-hidden="true" className="h-4 w-4" />
              已取消
              {info?.tool ? <span className="rounded-control bg-card px-1.5 py-0.5 font-mono text-caption">{info.tool}</span> : null}
            </p>
            {info?.detail ? <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-control bg-card px-3 py-2 font-mono text-caption text-muted-foreground">{info.detail}</pre> : null}
            <p className="mt-2 text-small text-muted-foreground">这个操作所在的执行已被停止，不需要再确认。</p>
          </div>
        );
      })}
      {approvals.map((approval) => {
        const info = infos[approval];
        if (info?.kind === "profile_switch") {
          const step = nodeTitles[info.nodeId];
          const target = nameOf(info.detail);
          return (
            <Attention
              key={approval}
              icon={ArrowRightLeft}
              data-testid="approval-item"
              data-state="pending"
              data-kind="profile_switch"
              title={
                <>
                  要切换专家，需要你批准
                  <span className="rounded-control bg-card px-1.5 py-0.5 text-caption font-medium text-gray-700">{target}</span>
                </>
              }
            >
              <p className="mt-2 text-body text-gray-700">
                {step ? `步骤「${step}」` : "这个步骤"}
                将从下一次执行起改由 {target} 执行；正在执行的这一次不受影响。
              </p>
              {info.tool ? <p className="mt-1 break-words text-small text-muted-foreground">{humanizeProfileRefs(info.tool, nameOf)}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" data-testid="approval-approve" onClick={() => onDecide(approval, "approve", false)}>批准切换</Button>
                <Button size="sm" variant="danger" data-testid="approval-reject" onClick={() => onDecide(approval, "reject", false)}>拒绝</Button>
              </div>
            </Attention>
          );
        }
        if (info?.kind === "node_approval" || info?.kind === "sop_step") {
          // 计划里的审批节点（SOP 的步骤前后也是）：标题就是它要你批准的事，没有「总是允许」。
          const title = info.tool || (info.kind === "sop_step" ? "流程里的一步需要你批准" : "计划里的一步需要你批准");
          return (
            <Attention key={approval} icon={ClipboardCheck} data-testid="approval-item" data-state="pending" data-kind={info.kind} title={title}>
              {info.detail ? <p className="mt-2 whitespace-pre-wrap break-words text-body text-gray-700">{info.detail}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" data-testid="approval-approve" onClick={() => onDecide(approval, "approve", false)}>批准</Button>
                <Button size="sm" variant="danger" data-testid="approval-reject" onClick={() => onDecide(approval, "reject", false)}>拒绝</Button>
              </div>
            </Attention>
          );
        }
        return (
          <Attention
            key={approval}
            icon={ShieldAlert}
            data-testid="approval-item"
            data-state="pending"
            title={
              <>
                需要你的确认
                {info?.tool ? <span className="rounded-control bg-card px-1.5 py-0.5 font-mono text-caption font-normal text-gray-700">{info.tool}</span> : null}
              </>
            }
          >
            {info?.detail ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-control bg-card px-3 py-2 font-mono text-caption text-foreground">{info.detail}</pre> : null}
            {info ? null : <p className="mt-1 break-all text-small text-muted-foreground">{approval}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => onDecide(approval, "approve", false)}>允许一次</Button>
              {info?.rule ? (
                <Button size="sm" title={`本任务内以后都允许：${ruleText(info.rule)}`} onClick={() => onDecide(approval, "approve", true)}>
                  本任务总是允许
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={() => onDecide(approval, "reject", false)}>拒绝</Button>
            </div>
            {info?.rule ? <p className="mt-2 text-small text-muted-foreground">总是允许：{ruleText(info.rule)}，只在这个任务里有效。</p> : null}
            {info && !info.rule ? <p className="mt-2 text-small text-muted-foreground">这个操作每次都需要你确认，不能设为总是允许。</p> : null}
          </Attention>
        );
      })}
    </section>
  );
}
