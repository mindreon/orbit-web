import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// Passive messages: tinted 50 surface, 700 text. Anything that needs a person to act is an <Attention> card instead.
const TONES = {
  danger: { box: "bg-danger-50 text-danger-700", Icon: CircleAlert },
  warning: { box: "bg-warning-50 text-warning-700", Icon: AlertTriangle },
  info: { box: "bg-primary-50 text-primary-700", Icon: Info },
} as const;

export function Alert({ tone = "danger", children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  const { box, Icon } = TONES[tone];
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-control px-3 py-2 text-body", box, className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
