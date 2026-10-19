import type { ReactNode } from "react";
import { cn } from "../lib/cn";
/** Status copy belongs to its feature; this shared primitive encodes meaning, never colour alone. */
export function StatusBadge({ status, children }: { status: string; children: ReactNode }) {
  const tone = ["running", "working", "in_progress"].includes(status) ? "bg-primary-50 text-primary-700"
    : ["waiting_input", "waiting_approval", "pending", "blocked", "in_review", "escalated", "resolving", "unknown"].includes(status) ? "bg-warning-50 text-warning-700"
    : ["succeeded", "completed", "finished", "resolved", "approve"].includes(status) ? "bg-success-50 text-success-700"
    : ["failed", "timed_out", "budget_exhausted", "reject"].includes(status) ? "bg-danger-50 text-danger-700" : "bg-gray-100 text-gray-700";
  return <span className={cn("inline-block rounded-control px-1.5 text-caption", tone)}>{children}</span>;
}
