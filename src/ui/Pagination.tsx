import { ChevronLeft, ChevronRight } from "lucide-react";

/** 底部固定分页条：「第 x-y 条 / 总共 N 条」加上一页、下一页。total 为 0 时不显示。 */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const arrow = "flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40";
  return (
    <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-card px-6 text-sm text-muted-foreground">
      <span>
        第 {from}-{to} 条 / 总共 {total} 条
      </span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label="上一页" className={arrow} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[4rem] text-center text-foreground">
          {page} / {pages}
        </span>
        <button type="button" aria-label="下一页" className={arrow} disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </span>
    </footer>
  );
}
