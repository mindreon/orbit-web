"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app-nav";

/**
 * Baize-aligned platform shell: cold-gray sidebar + white main.
 * Rooms uses a fullscreen task shell (no enterprise chrome).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isRooms = pathname === "/rooms" || pathname.startsWith("/rooms/");

  if (isRooms) {
    return (
      <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-sidebar text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4">
        <div className="mb-6 px-1">
          <p className="text-[17px] font-semibold leading-[1.35] text-foreground">
            Orbit
          </p>
          <p className="mt-1 text-xs text-muted-foreground">企业 AI 工作台</p>
        </div>
        <AppNav />
        <div className="mt-auto rounded-lg border border-sidebar-border bg-background p-3">
          <p className="text-xs font-semibold text-foreground">Runtime</p>
          <p className="mt-1 text-xs text-muted-foreground">
            dsh · ACP · process isolation
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-6">
          <div>
            <p className="text-sm font-semibold text-foreground">企业 AI 工作台</p>
            <p className="text-xs text-muted-foreground">
              任务、能力与治理统一入口
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="inline-flex h-6 items-center rounded-full bg-green-100 px-2.5 font-medium text-green-600">
              dsh runtime
            </span>
            <span className="inline-flex h-6 items-center rounded-full bg-yellow-100 px-2.5 font-medium text-yellow-700">
              W1 · 内存模式
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto rounded-tl-lg border-l border-t border-border bg-background p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
