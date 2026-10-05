import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, description, actions }: { icon: LucideIcon; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-card text-gray-500 shadow-sm">
        <Icon aria-hidden="true" className="h-9 w-9" strokeWidth={1.5} />
      </span>
      <p className="mt-5 text-title font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-2 max-w-md text-body text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-6 flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
