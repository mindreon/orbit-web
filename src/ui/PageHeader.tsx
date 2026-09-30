import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** 每个页面顶部的标题栏：左边标题和说明，右边放主操作。和 baize 的页面头一致。 */
export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      {back ? (
        <>
          <Link to={back.to} aria-label={`返回${back.label}`} className="-ml-2 flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-secondary">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
          <span aria-hidden="true" className="-mx-2 text-border">
            /
          </span>
        </>
      ) : null}
      <h1 className="shrink-0 text-base font-semibold text-foreground">{title}</h1>
      {description ? <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">{description}</p> : null}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** 标题栏下面的内容区：灰底，自己滚动。 */
export function PageBody({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted px-6 py-5">
      <div className={narrow ? "max-w-3xl" : "mx-auto max-w-6xl"}>{children}</div>
    </div>
  );
}
