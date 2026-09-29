import { useEffect, useState } from "react";
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

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f8] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-lg font-medium">技能</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#666]">来自 SkillHub 的目录已经保存在这边。打开这一页只读取本地数据，只展示，不安装。</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`h-8 rounded-full px-3 text-sm ${sortBy === item.id ? "bg-[#1a1a1a] text-white" : "bg-white text-[#444]"}`}
              onClick={() => {
                setSortBy(item.id);
                setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            aria-label="搜索技能"
            value={keyword}
            placeholder="搜索技能"
            className="h-9 w-56 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-3 text-sm"
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="分类"
            value={category}
            className="h-9 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-2 text-sm"
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
            className="h-9 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-2 text-sm"
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
        {error ? <p className="mt-4 text-sm text-[#c04545]">{error}</p> : null}
        {loading ? <p className="mt-6 text-sm text-[#888]">正在读取</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="mt-6 text-sm text-[#888]">{syncedAt ? "没有匹配的技能" : "正在从 SkillHub 同步，请稍后刷新"}</p>
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
                  className="block h-full w-full rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white px-5 py-6 text-left hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                >
                  <span className="flex items-center gap-3">
                    {icon ? (
                      <img src={icon} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg text-[15px] font-medium" style={{ background: color.bg, color: color.fg }}>
                        {skill.name.trim().slice(0, 1) || "技"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{skill.name}</span>
                  </span>
                  {label ? (
                    <span className="mt-3 inline-flex h-5 items-center rounded-[12px] border border-[rgba(0,0,0,0.08)] px-2 text-[10px] text-[#666]">{label}</span>
                  ) : null}
                  <span className="mt-2 line-clamp-2 block text-[13px] leading-5 text-[rgba(0,0,0,0.55)]">{skill.description}</span>
                  <span className="mt-4 flex items-center gap-3 text-xs text-[#888]">
                    <span>★ {formatCount(skill.stars)}</span>
                    <span>下载 {formatCount(skill.downloads)}</span>
                    {sourceLabel(skill.source) ? <span className="ml-auto">{sourceLabel(skill.source)}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {total > pageSize ? (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button type="button" className="rounded-lg bg-white px-3 py-1 disabled:text-[#bbb]" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </button>
            <span className="text-[#888]">
              {page} / {pages}
            </span>
            <button type="button" className="rounded-lg bg-white px-3 py-1 disabled:text-[#bbb]" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
              下一页
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
