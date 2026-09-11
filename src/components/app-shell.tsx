import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-zinc-900">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-950 p-4 text-white">
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 p-4">
          <p className="text-lg font-semibold tracking-wide">Orbit</p>
          <p className="mt-1 text-xs text-blue-100">企业 AI 工作台</p>
        </div>
        <AppNav />
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-medium text-slate-200">Runtime</p>
          <p className="mt-1 text-xs text-slate-400">dsh · ACP · process isolation</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <p className="text-sm font-semibold">企业 AI 工作台</p>
            <p className="text-xs text-zinc-500">任务、能力与治理统一入口</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
              dsh runtime
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
              W1 · 内存模式
            </span>
          </div>
        </header>
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
