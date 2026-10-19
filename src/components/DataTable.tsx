import type { ReactNode } from "react";
export function DataTable({ name, headers, children }: { name: string; headers: readonly string[]; children: ReactNode }) {
  return <div className="min-w-0 overflow-x-auto rounded-card bg-card"><table aria-label={name} className="w-full whitespace-nowrap text-left text-small [&_td]:h-10 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3"><thead className="text-caption font-medium text-muted-foreground"><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{children}</tbody></table></div>;
}
