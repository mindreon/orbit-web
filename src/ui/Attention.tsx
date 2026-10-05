import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

const TONES = {
  warning: { box: "bg-warning-50", bar: "bg-warning-500", icon: "text-warning-700" },
  danger: { box: "bg-danger-50", bar: "bg-danger-500", icon: "text-danger-700" },
  info: { box: "bg-primary-50", bar: "bg-primary-500", icon: "text-primary-700" },
} as const;

type AttentionProps = Omit<HTMLAttributes<HTMLElement>, "title"> &
  Record<`data-${string}`, string | undefined> & {
    tone?: keyof typeof TONES;
    icon: LucideIcon;
    title: ReactNode;
  };

/**
 * "This needs you": an approval waiting, a blocked review, a takeover, an exhausted budget, a question.
 * A tinted surface with a left accent bar and a shadow, the loudest thing in its view; everything else stays flat and grey.
 */
export function Attention({ tone = "warning", icon: Icon, title, children, className, ...rest }: AttentionProps) {
  const look = TONES[tone];
  return (
    <section className={cn("relative overflow-hidden rounded-card py-4 pl-5 pr-4 shadow-sm", look.box, className)} {...rest}>
      <span aria-hidden="true" data-testid="attention-bar" className={cn("absolute inset-y-0 left-0 w-1", look.bar)} />
      <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
        <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", look.icon)} />
        {title}
      </p>
      {children}
    </section>
  );
}
