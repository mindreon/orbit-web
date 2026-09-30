import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search, Star } from "lucide-react";
import { Link } from "react-router";
import { describeFailure } from "../lib/api";
import { listSkillCategories, listSkills, type Skill, type SkillCategory } from "../lib/catalog";
import { formatCount, safeIcon, skillPath, sourceLabel, tint } from "./skillFormat";

const SORTS = [
  { id: "score", label: "全部" },
  { id: "trending", label: "近期飙升" },
  { id: "downloads", label: "下载量" },
  { id: "updated_at", label: "最近上新" },
] as const;

const SOURCES = [
  { id: "", label: "全部来源" },
  { id: "clawhub", label: "ClawHub" },
  { id: "community", label: "SkillHub" },
  { id: "enterprise", label: "企业" },
] as const;

export function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [syncedAt, setSyncedAt] = useState("");
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["id"]>("score");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    listSkillCategories()
      .then((body) => {
        if (!gone) setCategories(body.items ?? []);
      })
      .catch(() => {
        if (!gone) setCategories([]);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    listSkills({ sortBy, category, source, keyword: keyword.trim(), page })
      .then((body) => {
        if (gone) return;
        setItems(body.items ?? []);
        setTotal(body.total ?? 0);
        setSyncedAt(body.syncedAt ?? "");
        setError("");
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取技能目录失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [sortBy, category, source, keyword, page]);

  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const selectClass =
    "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none hover:border-primary/50 focus:border-primary";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-base font-semibold text-foreground">技能</h1>
        <p className="ml-4 hidden truncate text-sm text-muted-foreground md:block">来自 SkillHub 的目录，只读取本地数据，只展示，不安装</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-muted px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block w-full sm:w-72">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="搜索技能"
                value={keyword}
                placeholder="搜索技能..."
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <div role="tablist" aria-label="排序" className="inline-flex rounded-lg bg-secondary p-0.5">
              {SORTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={sortBy === item.id}
                  className={`h-8 rounded-md px-3 text-sm transition-colors ${sortBy === item.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    setSortBy(item.id);
                    setPage(1);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <select
              aria-label="分类"
              value={category}
              className={selectClass}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部分类</option>
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="来源"
              value={source}
              className={selectClass}
              onChange={(event) => {
                setSource(event.target.value);
                setPage(1);
              }}
            >
              {SOURCES.map((item) => (
                <option key={item.id || "all"} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          {loading ? <p className="mt-6 text-sm text-muted-foreground">正在读取</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">{syncedAt ? "没有匹配的技能" : "正在从 SkillHub 同步，请稍后刷新"}</p>
          ) : null}
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((skill) => {
              const color = tint(skill.name);
              const icon = safeIcon(skill.iconUrl);
              const label = skill.categoryName || skill.category;
              return (
                <li key={skill.id}>
                  <Link
                    to={skillPath(skill.handle, skill.slug)}
                    className="flex h-full min-h-[172px] w-full flex-col rounded-lg border border-border bg-card p-4 text-left transition-shadow hover:border-primary/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
                  >
                    <span className="flex items-center gap-3">
                      {icon ? (
                        <img src={icon} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-medium" style={{ background: color.bg, color: color.fg }}>
                          {skill.name.trim().slice(0, 1) || "技"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{skill.name}</span>
                    </span>
                    <span className="mb-3 mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{skill.description}</span>
                    <span className="mt-auto flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                      {label ? <span className="max-w-[40%] truncate rounded bg-secondary px-1.5 py-0.5 text-foreground/70">{label}</span> : null}
                      <span className="inline-flex items-center gap-1">
                        <Star aria-hidden="true" className="h-3.5 w-3.5" />
                        {formatCount(skill.stars)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                        {formatCount(skill.downloads)}
                      </span>
                      {sourceLabel(skill.source) ? <span className="ml-auto">{sourceLabel(skill.source)}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {total > 0 ? (
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-card px-6 text-sm text-muted-foreground">
          <span>
            第 {from}-{to} 条 / 总共 {total} 条
          </span>
          <span className="flex items-center gap-2">
            <button type="button" aria-label="上一页" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4rem] text-center text-foreground">
              {page} / {pages}
            </span>
            <button type="button" aria-label="下一页" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </footer>
      ) : null}
    </div>
  );
}
