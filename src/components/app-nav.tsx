"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { control } from "@/lib/control";

export function AppNav() {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await control.listApprovals();
        if (!cancelled) {
          setPending(res.items.filter((item) => item.status === "pending").length);
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
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const unreadPlaceholder = "unreadPlaceholder" in item && item.unreadPlaceholder;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
              active
                ? "bg-white/15 font-medium text-white"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>{item.label}</span>
            {unreadPlaceholder ? (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] text-slate-950"
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
