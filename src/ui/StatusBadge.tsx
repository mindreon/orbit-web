import { cn } from "../lib/cn";

const TONES = {
  neutral: { chip: "bg-secondary text-foreground/70", dot: "bg-muted-foreground" },
  info: { chip: "bg-accent text-accent-foreground", dot: "bg-primary" },
  success: { chip: "bg-success/10 text-success", dot: "bg-success" },
  warning: { chip: "bg-warning/10 text-warning", dot: "bg-warning" },
  danger: { chip: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", pulse = false, children, ...rest }: { tone?: Tone; pulse?: boolean; children: React.ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium", TONES[tone].chip)} {...rest}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", TONES[tone].dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
