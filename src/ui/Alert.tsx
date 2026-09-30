import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const TONES = {
  danger: { box: "border-destructive/30 bg-destructive/10 text-destructive", Icon: CircleAlert },
  warning: { box: "border-warning/30 bg-warning/10 text-warning", Icon: AlertTriangle },
  info: { box: "border-primary/30 bg-accent text-accent-foreground", Icon: Info },
} as const;

export function Alert({ tone = "danger", children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  const { box, Icon } = TONES[tone];
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", box, className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
