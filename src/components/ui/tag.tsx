import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const colorMap = {
  default: "bg-surface-muted text-muted-foreground",
  processing: "bg-primary-100 text-primary-600",
  success: "bg-green-100 text-green-600",
  error: "bg-red-100 text-red-600",
  warning: "bg-amber-100 text-amber-600",
  attention: "bg-yellow-100 text-yellow-700",
  info: "bg-cyan-100 text-cyan-600",
  advanced: "bg-violet-100 text-violet-600",
} as const;

export type TagColor = keyof typeof colorMap;

/** Soft pill Tag — Baize product status pattern (not solid Badge). */
export function Tag({
  children,
  color = "default",
  className,
}: {
  children: ReactNode;
  color?: TagColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
        colorMap[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
