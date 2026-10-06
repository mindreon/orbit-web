import { ArrowRightLeft, ClipboardCheck, Pencil, ShieldAlert, ShieldCheck, ShieldOff, ShieldX } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { humanizeProfileRefs, memberApprovalTitle } from "../../lib/display";
import { alwaysHint, approvalGist, approvalTitle, ruleText, type ApprovalInfo, type ApprovalState } from "../../lib/approvals";
import { isTyping, useImeGuard } from "../../lib/keys";
import { cn } from "../../lib/cn";
import { Avatar } from "../TeamAvatars";
import { DockCard, type QueueNav } from "./DockCard";

const ownerTone = (role: string) => [...role].reduce((sum, char) => sum + char.charCodeAt(0), 0);

// ---- 停靠在输入框位置上的审批卡 ----------------------------------------------------------------------------------------------

interface ApprovalCardProps {
  readonly approvalId: string;
  readonly info: ApprovalInfo | undefined;
  /** 步骤 id 到标题，切换专家的审批用它说明是哪一步。 */
  readonly nodeTitles?: Readonly<Record<string, string>>;
  /** 专家引用（id@版本）到显示名，切换专家的审批不显示引用。 */
  readonly nameOf?: (ref: string) => string;
  /** 成员的角色 ID 到显示名（团队里查）；不传就直接写角色 ID。 */
  readonly roleNameOf?: (role: string) => string;
  readonly nav?: QueueNav | null;
  /** 数字键只在排在最前的这一张上生效。 */
  readonly active?: boolean;
  /** 「否」旁边输入框里写的话；翻到别的审批再翻回来还在。 */
  readonly reason: string;
  readonly onReason: (text: string) => void;
  readonly onDecide: (approvalId: string, decision: "approve" | "reject", always: boolean, reason: string) => void;
}

/** 编号的选项行：圆圈里的数字，悬停或键盘聚焦时反色；`hint` 是下面一行淡色说明。 */
function Choice({ index, label, hint, title, testId, onClick }: { index: number; label: string; hint?: string; title?: string; testId: string; onClick: () => void }) {
  return (
    <button type="button" data-testid={testId} title={title} className="group flex min-h-8 w-full items-start gap-2 rounded-control px-2 py-1 text-left text-body text-foreground hover:bg-warning-100 focus-visible:bg-warning-100 focus-visible:outline-none" onClick={onClick}>
      <span aria-hidden="true" className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-gray-300 text-caption font-medium text-gray-600 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background group-focus-visible:border-foreground group-focus-visible:bg-foreground group-focus-visible:text-background">
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words">{label}</span>
        {hint ? <span className="block break-words text-small text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}

/**
 * 一条等你确认的审批，停靠在输入框的位置：标题说清要批准什么，下面是命令或说明，再是编号的选择（1 允许、2 本任务内总是允许——只有这条审批
 * 提供了规则才有）和一行拒绝：写下想怎么调整，回车或点「否」。切换专家、计划和流程里的审批各有各的说法，都没有「总是允许」。
 */
export function ApprovalCard({ approvalId, info, nodeTitles = {}, nameOf = (ref) => ref, roleNameOf = (role) => role, nav = null, active = true, reason, onReason, onDecide }: ApprovalCardProps) {
  const ime = useImeGuard();
  const kind = info?.kind ?? "";
  const title = approvalTitle(info, nameOf);
  const rule = kind === "tool_call" || kind === "" ? (info?.rule ?? null) : null;
  const approveLabel = kind === "profile_switch" ? "批准切换" : kind === "node_approval" || kind === "sop_step" ? "批准" : "允许";
  const decide = (decision: "approve" | "reject", always = false) => onDecide(approvalId, decision, always, decision === "reject" ? reason.trim() : "");

  // 数字键：1 允许，2 总是允许；焦点在输入框里时不抢。
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "1") {
        event.preventDefault();
        onDecide(approvalId, "approve", false, "");
      } else if (event.key === "2" && rule) {
        event.preventDefault();
        onDecide(approvalId, "approve", true, "");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, approvalId, rule, onDecide]);

  const Icon = kind === "profile_switch" ? ArrowRightLeft : kind === "node_approval" || kind === "sop_step" ? ClipboardCheck : ShieldAlert;
  const member = info?.role ? info.roleLabel || roleNameOf(info.role) : "";
  const step = nodeTitles[info?.nodeId ?? ""];

  return (
    <DockCard
      icon={Icon}
      label={
        member ? (
          <span className="flex items-center gap-1.5">
            <Avatar name={member} tone={ownerTone(info?.role ?? "")} />
            <span data-testid="approval-member">{memberApprovalTitle(member)}</span>
          </span>
        ) : (
          "需要你确认"
        )
      }
      nav={nav}
      active={active}
      aria-label="待确认的操作"
      data-testid="approval-item"
      data-state="pending"
      data-kind={kind || undefined}
      data-role={info?.role || undefined}
      data-approval-id={approvalId}
    >
      <p data-testid="approval-title" className="mt-2 break-words text-body font-semibold text-foreground">
        {title}
      </p>
      {kind === "profile_switch" && info ? (
        <>
          <p className="mt-1 text-body text-gray-700">
            {step ? `步骤「${step}」` : "这个步骤"}将从下一次执行起改由 {nameOf(info.detail)} 执行；正在执行的这一次不受影响。
          </p>
          {info.tool ? <p className="mt-1 break-words text-small text-muted-foreground">{humanizeProfileRefs(info.tool, nameOf)}</p> : null}
        </>
      ) : null}
      {(kind === "node_approval" || kind === "sop_step") && info?.detail ? <p className="mt-1 whitespace-pre-wrap break-words text-body text-gray-700">{info.detail}</p> : null}
      {(kind === "tool_call" || kind === "") && info?.detail ? (
        <pre data-testid="approval-detail" className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-control bg-card px-3 py-2 font-mono text-caption text-foreground ring-1 ring-border">
          {info.detail}
        </pre>
      ) : null}
      {info ? null : <p className="mt-1 break-all text-small text-muted-foreground">{approvalId}</p>}
      <div className="mt-2 space-y-0.5">
        <Choice index={1} label={approveLabel} testId="approval-approve" onClick={() => decide("approve")} />
        {rule ? <Choice index={2} label="本任务内总是允许" hint={alwaysHint(rule)} title={`本任务内以后都允许：${ruleText(rule)}`} testId="approval-always" onClick={() => decide("approve", true)} /> : null}
        {info && !rule && (kind === "tool_call" || kind === "") ? <p className="px-2 py-1 text-small text-muted-foreground">这个操作每次都需要你确认，不能设为总是允许。</p> : null}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-control bg-card py-1 pl-2 pr-1 ring-1 ring-border focus-within:ring-primary-500">
        <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={reason}
          aria-label="拒绝并说明如何调整"
          placeholder="否，请告诉我如何调整"
          className="h-7 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => onReason(event.target.value)}
          onCompositionEnd={ime.onCompositionEnd}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !ime.isImeKey(event)) {
              event.preventDefault();
              decide("reject");
            }
          }}
        />
        <button type="button" data-testid="approval-reject" className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-foreground px-3 text-small font-medium text-background hover:bg-gray-700" onClick={() => decide("reject")}>
          否<span aria-hidden="true">↵</span>
        </button>
      </div>
    </DockCard>
  );
}

// ---- 留在对话里的一行标记 -----------------------------------------------------------------------------------------------------

const MARKER_LOOK: Record<ApprovalState, { Icon: typeof ShieldAlert; lead: string; tone: string }> = {
  pending: { Icon: ShieldAlert, lead: "等待你确认", tone: "bg-warning-50 text-warning-700 hover:bg-warning-100" },
  approved: { Icon: ShieldCheck, lead: "已允许", tone: "text-muted-foreground" },
  rejected: { Icon: ShieldX, lead: "已拒绝", tone: "text-muted-foreground" },
  cancelled: { Icon: ShieldOff, lead: "已取消", tone: "text-muted-foreground" },
};

/**
 * 审批在对话里被问到的地方：一行，图标加「等待你确认：标题」，点它回到停靠的那张卡；决定之后变成「已允许 / 已拒绝 / 已取消：标题」，
 * 不再是整张卡。整行放不下就截断，完整内容在 title 里。
 */
export function ApprovalMarker({ approvalId, info, state, nameOf = (ref) => ref, roleNameOf = (role) => role, onFocus }: Pick<ApprovalCardProps, "approvalId" | "info" | "nameOf" | "roleNameOf"> & { state: ApprovalState; onFocus: (approvalId: string) => void }) {
  const { Icon, lead, tone } = MARKER_LOOK[state];
  const gist = approvalGist(info);
  const member = info?.role ? info.roleLabel || roleNameOf(info.role) : "";
  const text = `${lead}：${approvalTitle(info, nameOf)}`;
  const body: ReactNode = (
    <>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">
        {member ? `${member} · ` : ""}
        {text}
        {gist ? <span className="text-muted-foreground"> · {gist}</span> : null}
      </span>
    </>
  );
  const common = { "data-testid": "approval-marker", "data-state": state, "data-approval-id": approvalId, "data-role": info?.role || undefined, title: [member, text, gist].filter(Boolean).join(" · ") };
  const base = "mx-auto flex min-h-8 w-full items-center gap-2 rounded-control px-3 py-1 text-small";
  return state === "pending" ? (
    <button type="button" {...common} className={cn(base, "text-left font-medium", tone)} onClick={() => onFocus(approvalId)}>
      {body}
    </button>
  ) : (
    <p {...common} className={cn(base, tone)}>
      {body}
    </p>
  );
}
