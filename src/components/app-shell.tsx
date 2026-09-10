import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white p-4">
        <p className="mb-6 px-3 text-sm font-semibold tracking-wide text-zinc-900">
          Orbit
        </p>
        <AppNav />
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
