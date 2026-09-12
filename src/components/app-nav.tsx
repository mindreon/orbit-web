"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { control } from "@/lib/control";
import { cn } from "@/lib/utils";

export function AppNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await control.listApprovals();
        if (!cancelled) {
          setPending(
            res.items.filter((item) => item.status === "pending").length,
          );
        }
      } catch {
        // Control may be down during local boot; keep the last count.
      }
    }
    const start = window.setTimeout(() => void tick(), 0);
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex gap-1",
        compact ? "flex-row flex-wrap items-center" : "flex-1 flex-col",
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const unreadPlaceholder =
          "unreadPlaceholder" in item && item.unreadPlaceholder;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between rounded-md text-sm transition-colors duration-150",
              compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            <span>{item.label}</span>
            {unreadPlaceholder ? (
              <span
                className={cn(
                  "ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                  pending > 0
                    ? "bg-warning-soft text-warning-foreground"
                    : "bg-surface-muted text-muted-foreground",
                )}
                aria-label={
                  pending > 0
                    ? `${pending} pending approvals`
                    : "No pending approvals"
                }
                title={pending > 0 ? `${pending} pending` : "Unread badge"}
              >
                {pending > 0 ? pending : "·"}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
