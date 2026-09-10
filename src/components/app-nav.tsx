"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export function AppNav() {
  const pathname = usePathname();

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
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              active
                ? "bg-zinc-200 font-medium text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <span>{item.label}</span>
            {unreadPlaceholder ? (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-300 px-1 text-[10px] text-zinc-600"
                aria-label="Unread approvals (placeholder)"
                title="Unread badge placeholder"
              >
                ·
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
