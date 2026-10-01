import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { describeFailure } from "../lib/api";
import { listSkillCategories, listSkills, skillIconPath, type Skill, type SkillCategory } from "../lib/catalog";
import { CatalogAvatar } from "../components/CatalogAvatar";
import { CatalogHeader } from "../shell/CatalogHeader";
import { Alert } from "../ui/Alert";
import { marketCardClass } from "../ui/card";
import { ChipRow } from "../ui/ChipRow";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/Skeleton";
import { HeadingTabs, SegmentedTabs } from "../ui/Tabs";
import { skillPath } from "./skillFormat";

const SORTS = [
  { id: "downloads", label: "最热" },
  { id: "likes", label: "点赞" },
  { id: "updated_at", label: "最新" },
] as const;

const SOURCES = [
  { id: "", label: "全部" },
  { id: "common", label: "ModelScope" },
  { id: "nexa", label: "NEXA" },
] as const;

const PAGE_SIZE = 24;

export function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [installedAt, setInstalledAt] = useState("");
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["id"]>("downloads");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    listSkillCategories()
      .then((body) => !gone && setCategories(body.items ?? []))
      .catch(() => !gone && setCategories([]));
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
        setInstalledAt(body.installedAt ?? "");
        setError("");
      })
      .catch((err: unknown) => !gone && setError(describeFailure("读取技能目录失败", err)))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, [sortBy, category, source, keyword, page]);

  const chips = useMemo(() => [{ key: "", label: "全部" }, ...categories.map((item) => ({ key: item.key, label: item.name }))], [categories]);
  const reset = () => setPage(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <CatalogHeader
        title="技能"
        search={{
          value: keyword,
          placeholder: "搜索技能",
          onChange: (value) => {
            setKeyword(value);
            reset();
          },
        }}
      />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HeadingTabs
              label="来源"
              value={source}
              options={SOURCES}
              onChange={(id) => {
                setSource(id);
                reset();
              }}
            />
            <SegmentedTabs
              label="排序"
              value={sortBy}
              options={SORTS}
              onChange={(id) => {
                setSortBy(id);
                reset();
              }}
            />
          </div>
          <div className="mt-4">
            <ChipRow
              label="分类"
              value={category}
              chips={chips}
              onChange={(key) => {
                setCategory(key);
                reset();
              }}
            />
          </div>
          {error ? <Alert className="mt-4">{error}</Alert> : null}
          {loading && items.length === 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-[132px]" />
              ))}
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">{installedAt ? "没有匹配的技能" : "目录快照尚未装入，请稍后刷新"}</p> : null}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((skill) => {
              return (
                <li key={skill.id}>
                  <Link to={skillPath(skill.handle, skill.slug)} className={marketCardClass}>
                    <span className="flex items-center gap-3">
                      <CatalogAvatar src={skillIconPath(skill.handle, skill.slug)} fallback={skill.name} fallbackChar="技" />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{skill.name}</span>
                    </span>
                    <span className="mt-3 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{skill.description || skill.descriptionEn}</span>
                    <span className="mt-auto flex items-center gap-2.5 pt-2 text-xs text-muted-foreground">
                      {skill.likes > 0 ? <span title="点赞">♥ {skill.likes}</span> : null}
                      {skill.downloads > 0 ? <span title="下载量">{skill.downloads} 次下载</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  );
}
