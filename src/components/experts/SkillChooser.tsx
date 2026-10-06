import { ChevronDown, Hammer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeFailure } from "../../lib/api";
import { getSkill, listSkillCategories, listSkills, type Skill, type SkillCategory } from "../../lib/catalog";
import { usePopoverClose } from "../../lib/usePopoverClose";
import { Button } from "../../ui/Button";
import { ChooserPanel } from "../../ui/ChooserPanel";
import { Chip, ChipList } from "./Chip";
import { Input, Select } from "../../ui/fields";
import { Option } from "../../ui/Option";

const TRIGGER =
  "flex h-9 w-full items-center justify-between rounded-control border border-input bg-card px-3 text-body text-foreground outline-none hover:border-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

interface SkillChooserProps {
  /** 已选技能的 id。 */
  readonly chosen: readonly string[];
  /** 见过的 id → 名字；没有的先显示 id 本身，查到名字后换上。 */
  readonly labels: Readonly<Record<string, string>>;
  readonly onLabels: (records: Readonly<Record<string, string>>) => void;
  readonly onToggle: (skill: Skill) => void;
  readonly onRemove: (id: string) => void;
}

/**
 * 默认技能的选择器：目录很大（八万多条），所以列表不常驻，点「选择技能」才出现，
 * 里面按关键词搜索、按分类筛选，一页一页往后翻。已选的在外面摆成胶囊，随时能删。
 */
export function SkillChooser({ chosen, labels, onLabels, onToggle, onRemove }: SkillChooserProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<readonly Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<readonly SkillCategory[]>([]);
  const box = useRef<HTMLDivElement>(null);
  usePopoverClose(open, box, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    let gone = false;
    listSkillCategories()
      .then((body) => !gone && setCategories(body.items ?? []))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [open]);

  // 搜索和翻页共用一个请求：换词、换分类回到第一页（在 onChange 里重置），翻页把结果接在后面。
  useEffect(() => {
    if (!open) return;
    let gone = false;
    const timer = setTimeout(() => {
      setLoading(true);
      listSkills({ keyword: keyword.trim(), category: category || undefined, page })
        .then((body) => {
          if (gone) return;
          const found = body.items ?? [];
          setTotal(body.total ?? 0);
          setItems((prev) => (page > 1 ? [...prev, ...found] : found));
          setError("");
          if (found.length > 0) onLabels(Object.fromEntries(found.map((skill) => [skill.id, skill.name])));
        })
        .catch((err: unknown) => !gone && setError(describeFailure("读取技能失败", err)))
        .finally(() => !gone && setLoading(false));
    }, 250);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [open, keyword, category, page, onLabels]);

  // 编辑时已有的技能只有一个 id：按 id（handle/slug）查一次名字，查不出就显示 id 本身，不再重试。
  useEffect(() => {
    const missing = chosen.filter((id) => !(id in labels) && id.includes("/"));
    if (missing.length === 0) return;
    let gone = false;
    for (const id of missing) {
      const at = id.indexOf("/");
      getSkill(id.slice(0, at), id.slice(at + 1))
        .then((skill) => !gone && onLabels({ [id]: skill.name || id }))
        .catch(() => !gone && onLabels({ [id]: id }));
    }
    return () => {
      gone = true;
    };
  }, [chosen, labels, onLabels]);

  return (
    <div ref={box} className="relative">
      <ChipList label="已选技能" chips={chosen.map((id) => <Chip key={id} icon={Hammer} label={labels[id] ?? id} onRemove={() => onRemove(id)} />)} />
      <button type="button" data-testid="skill-chooser-trigger" aria-haspopup="listbox" aria-expanded={open} className={TRIGGER} onClick={() => setOpen((value) => !value)}>
        选择技能
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <ChooserPanel
          label="技能列表"
          className="mt-1"
          header={
            <>
              <Input
                aria-label="搜索技能"
                value={keyword}
                placeholder="搜索技能"
                autoFocus
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="按分类筛选"
                value={category}
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
              </Select>
            </>
          }
          footer={
            <>
              {items.length < total ? (
                <Button size="sm" variant="ghost" className="mr-auto" disabled={loading} onClick={() => setPage((current) => current + 1)}>
                  加载更多
                </Button>
              ) : null}
              <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
                完成
              </Button>
            </>
          }
        >
          {error ? <p className="px-2 py-1 text-small text-danger-700">{error}</p> : null}
          {loading && items.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">正在读取…</p> : null}
          {items.map((skill) => (
            <Option
              key={skill.id}
              kind="checkbox"
              checked={chosen.includes(skill.id)}
              label={skill.name}
              id={skill.id}
              onClick={() => onToggle(skill)}
            />
          ))}
          {!loading && items.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">没有匹配的技能。</p> : null}
        </ChooserPanel>
      ) : null}
    </div>
  );
}
