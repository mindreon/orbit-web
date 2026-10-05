import type { ReactNode } from "react";

/** 右栏每一段的统一标题：小号、中等字重、偏灰。它是「这一段是什么」，比下面卡片的标题（14px/600）弱一级。 */
export function Section({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-6 first:mt-0">
      <h3 className="text-small font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-small text-muted-foreground">{children}</p>;
}
