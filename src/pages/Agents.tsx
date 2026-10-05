import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { catalogueLabel, expertSummary, frameworkLabel } from "../lib/display";
import { listExperts, type Expert } from "../lib/experts";
import { Button } from "../ui/Button";
import { describeFailure } from "../lib/api";
import { agentIconPath, agentPath, listAgents, type Agent } from "../lib/catalog";
import { CatalogAvatar } from "../components/CatalogAvatar";
import { CatalogHeader } from "../shell/CatalogHeader";
import { Alert } from "../ui/Alert";
import { marketCardClass } from "../ui/card";
import { ChipRow } from "../ui/ChipRow";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/Skeleton";
import { SegmentedTabs } from "../ui/Tabs";
import { formatCount } from "./skillFormat";

const SORTS = [
  { id: "downloads", label: "最热" },
  { id: "stars", label: "收藏" },
  { id: "updated_at", label: "最新" },
] as const;

const PAGE_SIZE = 24;

/** 目录快照里没有分类标签全集，分类片从当页结果聚合出来。 */
export function AgentsPage() {
  const [items, setItems] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["id"]>("downloads");
  const [catalogue, setCatalogue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<readonly Expert[]>([]);

  useEffect(() => {
    let gone = false;
    listExperts()
      .then((items) => !gone && setMine(items))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    listAgents({ sortBy, catalogue, keyword: keyword.trim(), page })
      .then((body) => {
        if (gone) return;
        setItems(body.items ?? []);
        setTotal(body.total ?? 0);
        setError("");
      })
      .catch((err: unknown) => !gone && setError(describeFailure("读取专家目录失败", err)))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, [sortBy, catalogue, keyword, page]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const key of item.catalogues) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // 只显示叫得出中文名的分类；没收录的分类不露出英文原名。
    return [{ key: "", label: "全部" }, ...[...counts.entries()].filter(([key]) => catalogueLabel(key) !== "").map(([key, count]) => ({ key, label: catalogueLabel(key), count }))];
  }, [items]);
  const reset = () => setPage(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <CatalogHeader
        title="专家"
        search={{
          value: keyword,
          placeholder: "搜索专家",
          onChange: (value) => {
            setKeyword(value);
            reset();
          },
        }}
      >
        <Link to="/experts/new">
          <Button variant="primary" size="sm">
            创建专家
          </Button>
        </Link>
      </CatalogHeader>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {mine.length > 0 ? (
            <section aria-label="我的专家" className="mb-6">
              <h2 className="mb-2 text-small font-medium text-muted-foreground">我的专家</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((expert) => (
                  <li key={expert.expert_id} data-testid="my-expert" className="rounded-card bg-card p-4 shadow-sm">
                    {/* 名字和「编辑」是大小不同的两段字：按基线对齐。版本号只在编辑页里看 */}
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate text-body font-semibold text-foreground">{expert.name}</span>
                      <Link to={`/experts/${encodeURIComponent(expert.expert_id)}/edit`} className="ml-auto shrink-0 text-small text-primary-700 hover:underline">
                        编辑
                      </Link>
                    </div>
                    <p className="mt-1 line-clamp-2 text-small text-muted-foreground">{expertSummary(expert.instructions) || "没有指令"}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
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
              value={catalogue}
              chips={chips}
              onChange={(key) => {
                setCatalogue(key);
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
          {!loading && !error && items.length === 0 ? <p className="mt-6 text-body text-muted-foreground">没有匹配的专家</p> : null}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((agent) => {
              return (
                <li key={agent.id}>
                  <Link to={agentPath(agent.handle, agent.slug)} className={marketCardClass}>
                    <span className="flex items-center gap-3">
                      <CatalogAvatar src={agentIconPath(agent.handle, agent.slug)} fallback={agent.name} fallbackChar="专" />
                      <span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{agent.name}</span>
                    </span>
                    <span className="mt-3 line-clamp-2 text-small leading-5 text-muted-foreground">{expertSummary(agent.description)}</span>
                    <span className="mt-auto flex items-center gap-2.5 pt-2 text-caption text-muted-foreground">
                      {frameworkLabel(agent.framework) ? <span className="shrink-0 rounded-control bg-secondary px-1.5 py-0.5">{frameworkLabel(agent.framework)}</span> : null}
                      {agent.stars > 0 ? <span title="收藏">★ {formatCount(agent.stars)}</span> : null}
                      {agent.downloads > 0 ? <span title="运行">{formatCount(agent.downloads)} 次运行</span> : null}
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
