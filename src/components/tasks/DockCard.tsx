import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";

/** 停靠区里排着几件等你的事：第几件、一共几件，以及前后翻。 */
export interface QueueNav {
  readonly index: number;
  readonly total: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

/** 「‹ 1 / N ›」：几件事排队时翻看。 */
export function QueueNavigator({ nav }: { nav: QueueNav }) {
  return (
    <span data-testid="dock-queue" className="flex shrink-0 items-center text-caption font-medium text-gray-600">
      <button type="button" aria-label="上一件待处理" className="flex h-6 w-6 items-center justify-center rounded-control hover:bg-warning-100" onClick={nav.onPrev}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <span aria-live="polite" className="min-w-10 text-center tabular-nums">
        {nav.index + 1} / {nav.total}
      </span>
      <button type="button" aria-label="下一件待处理" className="flex h-6 w-6 items-center justify-center rounded-control hover:bg-warning-100" onClick={nav.onNext}>
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </span>
  );
}

type DockCardProps = Omit<HTMLAttributes<HTMLElement>, "title"> &
  Record<`data-${string}`, string | undefined> & {
    icon: LucideIcon;
    /** 左上角的类别：交互 / 需要你确认。 */
    label: ReactNode;
    /** 类别后面跟着的提问者（团队任务里的成员头像和名字）。 */
    who?: ReactNode;
    nav?: QueueNav | null;
    /** 右上角、队列导航旁边的操作（收起）。 */
    actions?: ReactNode;
    /** 当前排在最前的那张；其余的留在页面里但不显示，里面写了一半的回答不丢。 */
    active?: boolean;
    cardRef?: Ref<HTMLElement>;
  };

/**
 * 停靠在输入框位置上的「需要你」卡片（审批、Agent 提问）：和 `<Attention>` 一样是整页最响的那一块——暖色底、左侧强调条、阴影——
 * 加一圈细边，头一行是图标、类别、提问者，右边是队列导航。内容由调用方放在下面。
 */
export function DockCard({ icon: Icon, label, who, nav, actions, active = true, cardRef, className, children, ...rest }: DockCardProps) {
  return (
    <section ref={cardRef} tabIndex={-1} className={cn("relative overflow-hidden rounded-card border border-warning-200 bg-warning-50 py-3 pl-5 pr-3 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-primary-500", !active && "hidden", className)} {...rest}>
      <span aria-hidden="true" data-testid="attention-bar" className="absolute inset-y-0 left-0 w-1 bg-warning-500" />
      <header className="flex min-h-6 items-center gap-2 text-small font-medium text-gray-700">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-700" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{label}</span>
          {who}
        </span>
        {nav && nav.total > 1 ? <QueueNavigator nav={nav} /> : null}
        {actions}
      </header>
      {children}
    </section>
  );
}
