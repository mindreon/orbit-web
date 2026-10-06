import { ChevronUp, MessageCircleQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApprovalInfo } from "../../lib/approvals";
import type { AgentQuestion as Question } from "../../lib/taskEvents";
import { AgentQuestion } from "./AgentQuestion";
import { ApprovalCard } from "./ApprovalInbox";

interface PromptDockProps {
  /** 等你确认的审批，按它们出现的顺序。 */
  readonly approvals: readonly string[];
  readonly infos: Readonly<Record<string, ApprovalInfo>>;
  readonly nodeTitles: Readonly<Record<string, string>>;
  readonly nameOf: (ref: string) => string;
  readonly roleNameOf: (role: string) => string;
  readonly onDecide: (approvalId: string, decision: "approve" | "reject", always: boolean, reason: string) => void;
  readonly question: Question | null;
  readonly onAnswer: (text: string) => Promise<void>;
  /** 提问收起成了小胶囊：不排队，输入框回来。 */
  readonly minimized: boolean;
  readonly onMinimize: () => void;
  readonly onRestore: () => void;
  /** 对话里的标记被点了：翻到这条审批并把焦点给它。 */
  readonly focusRequest: { readonly id: string; readonly tick: number } | null;
}

/**
 * 输入框的位置上，等你处理的事一次只放一张卡：先是等你确认的审批（按出现的顺序），再是 Agent 的提问；不止一件时卡片右上角是「‹ 1 / N ›」。
 * 提问一直挂在页面里（收起、翻到别的卡时只是不显示），答了一半的内容不会丢；收起后留下「回答 N 个问题」的胶囊，点它回来。
 * 卡片出现时输入框由调用方藏起来（不卸载），草稿还在。放不下时（手机）卡片自己里面滚动，最高 45vh。
 */
export function PromptDock({ approvals, infos, nodeTitles, nameOf, roleNameOf, onDecide, question, onAnswer, minimized, onMinimize, onRestore, focusRequest }: PromptDockProps) {
  const [index, setIndex] = useState(0);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const root = useRef<HTMLDivElement>(null);
  const showsQuestion = question !== null && !minimized;
  const total = approvals.length + (showsQuestion ? 1 : 0);
  const at = total === 0 ? 0 : Math.min(index, total - 1);
  const go = (to: number) => setIndex((to + total) % total);
  const nav = { index: at, total, onPrev: () => go(at - 1), onNext: () => go(at + 1) };

  // 对话里的标记被点：翻到那条审批，滚进视野并聚焦。翻页后那张卡才挂上来，所以聚焦放在每次渲染之后做，等它出现就聚焦一次。
  const wanted = useRef<string | null>(null);
  const flushFocus = () => {
    if (wanted.current === null) return;
    const card = root.current?.querySelector<HTMLElement>(`[data-testid="approval-item"][data-approval-id="${CSS.escape(wanted.current)}"]`);
    if (!card) return;
    wanted.current = null;
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    card.focus({ preventScroll: true });
  };
  useEffect(flushFocus);
  useEffect(() => {
    if (!focusRequest) return;
    const target = approvals.indexOf(focusRequest.id);
    if (target < 0) return;
    wanted.current = focusRequest.id;
    setIndex(target);
    flushFocus();
    // 只在新的请求到来时翻页：审批列表本身变化不该把你从当前这张拉走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.tick]);

  if (total === 0 && !question) return null;
  const currentApproval = at < approvals.length ? (approvals[at] as string) : null;
  const questionCount = question?.questions?.length || 1;

  return (
    <div ref={root} data-testid="prompt-dock" className="shrink-0 px-4 sm:px-6">
      <div className="mx-auto max-w-reading pb-3 pt-2">
        {question && minimized ? (
          <div className="flex justify-center pb-1">
            <button type="button" data-testid="question-pill" className="flex h-8 items-center gap-1.5 rounded-full bg-warning-100 px-3 text-small font-medium text-warning-700 shadow-md ring-1 ring-warning-200 hover:bg-warning-50" onClick={onRestore}>
              <MessageCircleQuestion aria-hidden="true" className="h-4 w-4" />
              回答 {questionCount} 个问题
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {/* 内边距把阴影的位置留出来（滚动容器会裁掉框外的东西），负外边距让版面不变。 */}
        <div className="-m-2 max-h-[45vh] overflow-y-auto p-2" hidden={total === 0}>
          {currentApproval !== null ? (
            <ApprovalCard
              key={currentApproval}
              approvalId={currentApproval}
              info={infos[currentApproval]}
              nodeTitles={nodeTitles}
              nameOf={nameOf}
              roleNameOf={roleNameOf}
              nav={nav}
              reason={reasons[currentApproval] ?? ""}
              onReason={(text) => setReasons((all) => ({ ...all, [currentApproval]: text }))}
              onDecide={onDecide}
            />
          ) : null}
          {question ? <AgentQuestion key={`${question.attemptId}:${question.text}`} question={question} onAnswer={onAnswer} active={showsQuestion && currentApproval === null} nav={currentApproval === null ? nav : null} onMinimize={onMinimize} /> : null}
        </div>
      </div>
    </div>
  );
}
