import type { ReactNode } from "react";

/** 右栏每一段的统一标题样式。 */
export function Section({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-6 first:mt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-muted-foreground">{children}</p>;
}
