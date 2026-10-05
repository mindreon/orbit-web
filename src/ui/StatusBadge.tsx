import { cn } from "../lib/cn";

// Tinted 100 surface with the 700 text step: at least 4.5:1 in both themes (src/lib/contrast.test.ts).
const TONES = {
  neutral: { chip: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
  info: { chip: "bg-primary-100 text-primary-700", dot: "bg-primary-500" },
  success: { chip: "bg-success-100 text-success-700", dot: "bg-success-500" },
  warning: { chip: "bg-warning-100 text-warning-700", dot: "bg-warning-500" },
  danger: { chip: "bg-danger-100 text-danger-700", dot: "bg-danger-500" },
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", pulse = false, children, ...rest }: { tone?: Tone; pulse?: boolean; children: React.ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-medium", TONES[tone].chip)} {...rest}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", TONES[tone].dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
