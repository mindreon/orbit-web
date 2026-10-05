import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "../ui/fields";

interface CatalogHeaderProps {
  readonly title: string;
  readonly search?: { readonly value: string; readonly onChange: (value: string) => void; readonly placeholder: string };
  /** 右上角的主操作，比如「创建专家」。 */
  readonly children?: ReactNode;
}

/** 专家、技能、连接器三页共用的标题栏：左边是页面名，右边是搜索和主操作。 */
export function CatalogHeader({ title, search, children }: CatalogHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 bg-card px-4 sm:px-6">
      <h1 className="shrink-0 text-title font-semibold text-foreground">{title}</h1>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {search ? (
          <label className="relative min-w-0">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={search.placeholder} value={search.value} placeholder={search.placeholder} className="w-36 pl-9 sm:w-64" onChange={(event) => search.onChange(event.target.value)} />
          </label>
        ) : null}
        {children}
      </div>
    </header>
  );
}
