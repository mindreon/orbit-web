import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeFailure } from "../../lib/api";
import { listAgents, type Agent } from "../../lib/catalog";
import { usePopoverClose } from "../../lib/usePopoverClose";
import { expertFromAgent, type Expert } from "../../lib/experts";
import { refId } from "../../lib/team";
import { Button } from "../../ui/Button";
import { ChooserPanel } from "../../ui/ChooserPanel";
import { Input } from "../../ui/fields";
import { Option } from "../../ui/Option";

const TRIGGER =
  "flex h-9 w-full items-center gap-2 rounded-control border border-input bg-card px-3 text-body outline-none hover:border-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

interface ExpertChooserProps {
  /** 这位成员当前的专家（版本 ref），"" 是还没选。 */
  readonly value: string;
  /** 能当成员的单人专家（每位的最新版本）。 */
  readonly experts: readonly Expert[];
  readonly ariaLabel: string;
  readonly onSelect: (ref: string) => void;
  /** 从系统预置导入成功后交给调用方并入「我的专家」。 */
  readonly onImported: (expert: Expert) => void;
}

/** 一个可选的专家：最新版本；这位成员固定在较早的版本时多一项，名字后写明是第几版。列表只摆名字。 */
function optionsOf(experts: readonly Expert[], value: string): Array<{ ref: string; label: string }> {
  const options = experts.map((expert) => ({ ref: expert.ref, label: expert.name }));
  if (value !== "" && !options.some((option) => option.ref === value)) {
    const current = experts.find((expert) => expert.expert_id === refId(value));
    if (current) options.push({ ref: value, label: `${current.name}（第 ${value.split("@")[1]} 版）` });
  }
  return options;
}

/**
 * 成员由哪位专家担任：下拉里先列「我的专家」，再列目录里「系统预置」的智能体。
 * 两组都能按名字找；预置的选中即导入成自己的专家（已导入过的直接选，不再重复导入）。
 */
export function ExpertChooser({ value, experts, ariaLabel, onSelect, onImported }: ExpertChooserProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [agents, setAgents] = useState<readonly Agent[]>([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [agentsPage, setAgentsPage] = useState(1);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [importing, setImporting] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  usePopoverClose(open, box, () => setOpen(false));

  // 预置的智能体在目录里可能很多：按关键词问服务端（防抖），一页一页往后翻。
  useEffect(() => {
    if (!open) return;
    let gone = false;
    const timer = setTimeout(() => {
      setAgentsLoading(true);
      listAgents({ keyword: keyword.trim(), page: agentsPage })
        .then((body) => {
          if (gone) return;
          setAgents((prev) => (agentsPage > 1 ? [...prev, ...(body.items ?? [])] : body.items ?? []));
          setAgentsTotal(body.total ?? 0);
          setError("");
        })
        .catch((err: unknown) => !gone && setError(describeFailure("读取预置专家失败", err)))
        .finally(() => !gone && setAgentsLoading(false));
    }, 250);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [open, keyword, agentsPage]);

  const options = useMemo(() => optionsOf(experts, value), [experts, value]);
  const bySource = useMemo(() => {
    const map = new Map<string, Expert>();
    for (const expert of experts) if (expert.source) map.set(expert.source, expert);
    return map;
  }, [experts]);
  const needle = keyword.trim().toLowerCase();
  const own = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const selected = options.find((option) => option.ref === value);

  const pickOwn = (ref: string) => {
    onSelect(ref);
    setOpen(false);
  };

  const pickPreset = async (agent: Agent) => {
    setError("");
    // 导入过的预置在自己专家里留了来源（agent:<id>）：直接选它，不再导一份。
    const known = bySource.get(`agent:${agent.id}`);
    if (known) {
      pickOwn(known.ref);
      return;
    }
    setImporting(agent.id);
    try {
      const { expert } = await expertFromAgent(agent.handle, agent.slug);
      onImported(expert);
      pickOwn(expert.ref);
    } catch (err) {
      setError(describeFailure("添加预置专家失败", err));
    } finally {
      setImporting("");
    }
  };

  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} className={`${TRIGGER} ${selected ? "text-foreground" : "text-muted-foreground"}`} onClick={() => setOpen((current) => !current)}>
        <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.label : value || "请选择"}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <ChooserPanel label={ariaLabel} className="mt-1" header={<Input aria-label="搜索专家" value={keyword} placeholder="搜索专家" autoFocus onChange={(event) => {
          setKeyword(event.target.value);
          setAgentsPage(1);
        }} />}>
          {own.length > 0 ? <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">我的专家</p> : null}
          {own.map((option) => (
            <Option key={option.ref} kind="radio" checked={option.ref === value} label={option.label} id={option.ref} onClick={() => pickOwn(option.ref)} />
          ))}
          {experts.length === 0 ? <p className="px-3 py-1 text-caption text-muted-foreground">还没有自己的单人专家，可以在下面选系统预置。</p> : null}
          {own.length === 0 && experts.length > 0 ? <p className="px-3 py-1 text-caption text-muted-foreground">自己的专家里没有叫这个的。</p> : null}
          <p className="px-3 pb-1 pt-2 text-caption font-medium text-muted-foreground">系统预置</p>
          {agents.map((agent) => {
            const known = bySource.get(`agent:${agent.id}`);
            return (
              <Option
                key={agent.id}
                kind="radio"
                checked={known?.ref === value}
                label={agent.name}
                id={agent.id}
                disabled={importing !== ""}
                trailing={
                  <>
                    {importing === agent.id ? <span className="shrink-0 text-caption text-primary-700">正在添加…</span> : null}
                    {known && importing !== agent.id ? <span className="shrink-0 text-caption text-muted-foreground">已添加</span> : null}
                  </>
                }
                onClick={() => void pickPreset(agent)}
              />
            );
          })}
          {agentsLoading ? <p className="px-3 py-2 text-caption text-muted-foreground">正在读取…</p> : null}
          {!agentsLoading && agents.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">没有匹配的预置专家。</p> : null}
          {agents.length < agentsTotal ? (
            <Button size="sm" variant="ghost" className="mt-1 w-full" disabled={agentsLoading} onClick={() => setAgentsPage((current) => current + 1)}>
              加载更多
            </Button>
          ) : null}
          {error ? <p className="px-3 py-2 text-small text-danger-700">{error}</p> : null}
        </ChooserPanel>
      ) : null}
    </div>
  );
}
