import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Wrench, Sparkles, Cpu } from "lucide-react";
import { describeFailure } from "../lib/api";
import { agentIconPath, getAgent, type Agent, type AgentPrompt, type AgentRef } from "../lib/catalog";
import { CatalogAvatar } from "../components/CatalogAvatar";
import { expertFromAgent } from "../lib/experts";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { FileBrowser } from "../components/FileBrowser";
import { PageHeader } from "../ui/PageHeader";
import { formatCount, sourceLabel, timeAgo } from "./skillFormat";

// Markdown pulls Mermaid's loader. Keep that off the entry chunk.
const AgentMarkdown = lazy(() => import("../components/markdown/Markdown").then((module) => ({ default: module.Markdown })));

const TABS = ["概述", "提示词", "配置", "文件"] as const;
type Tab = (typeof TABS)[number];

/** 专家详情：说明、系统提示词、声明的技能与 MCP、模型和文件。只展示，不在这里运行。 */
export function AgentDetailPage() {
  const params = useParams();
  const handle = params.handle ?? "";
  const slug = params.slug ?? "";
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("概述");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [using, setUsing] = useState(false);

  const adoptExpert = async () => {
    setUsing(true);
    setError("");
    try {
      const { expert, unmatched } = await expertFromAgent(handle, slug);
      navigate(`/experts/${encodeURIComponent(expert.expert_id)}/edit`, { state: { unmatched } });
    } catch (err) {
      setError(describeFailure("使用这位专家失败", err));
      setUsing(false);
    }
  };

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setAgent(null);
    setTab("概述");
    setError("");
    getAgent(handle, slug)
      .then((body) => !gone && setAgent(body))
      .catch((err: unknown) => !gone && setError(describeFailure("读取专家失败", err)))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, [handle, slug]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader
        title="专家详情"
        back={{ to: "/experts/agents", label: "专家" }}
        actions={
          agent ? (
            <Button variant="primary" size="sm" disabled={using} onClick={() => void adoptExpert()}>
              使用这位专家
            </Button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <section aria-label="专家详情" className="mx-auto max-w-[1000px]">
          {loading ? <p className="text-sm text-muted-foreground">正在读取</p> : null}
          {error ? <Alert>{error}</Alert> : null}
          {agent ? <Detail agent={agent} tab={tab} onTab={setTab} /> : null}
        </section>
      </div>
    </div>
  );
}

function Detail({ agent, tab, onTab }: { agent: Agent; tab: Tab; onTab: (tab: Tab) => void }) {
  const when = timeAgo(Date.parse(agent.updatedAt));
  const from = sourceLabel(agent.source);
  return (
    <article>
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-4 md:gap-6">
          <CatalogAvatar
            src={agentIconPath(agent.handle, agent.slug)}
            fallback={agent.name}
            fallbackChar="专"
            className="h-12 w-12 rounded-[5.4px] text-lg font-medium"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="min-w-0 text-[18px] font-medium leading-7 tracking-[-0.01em] text-foreground md:text-[24px] md:leading-8">{agent.name}</h1>
            <div className="truncate font-mono text-[13px] leading-5 text-muted-foreground" title={agent.id}>
              {agent.id}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium leading-5 text-foreground">
              {from ? <span>来源 {from}</span> : null}
              {agent.framework ? <span className="text-muted-foreground">{agent.framework}</span> : null}
              {agent.stars > 0 ? <span className="text-muted-foreground">★ {formatCount(agent.stars)}</span> : null}
              {agent.downloads > 0 ? <span className="text-muted-foreground">{formatCount(agent.downloads)} 次运行</span> : null}
            </div>
          </div>
        </div>
        {agent.description ? <p className="mb-4 text-[14px] leading-[22px] text-foreground/80 [word-break:break-word]">{agent.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {agent.catalogues.map((key) => (
            <Pill key={key}>{prettyCatalogue(key)}</Pill>
          ))}
          {when ? <Pill>{when}更新</Pill> : null}
          {agent.license ? <Pill>{agent.license}</Pill> : null}
        </div>
      </header>
      <div className="relative mb-6 border-b border-border">
        <div className="flex items-center gap-10 md:gap-14" role="tablist" aria-label="专家内容">
          {TABS.map((name) => {
            const on = tab === name;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab(name)}
                className={`relative cursor-pointer pb-3 text-[16px] font-medium leading-6 ${on ? "text-foreground" : "text-muted-foreground"}`}
              >
                {name}
                {on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-foreground" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "概述" ? <Overview agent={agent} /> : null}
      {tab === "提示词" ? <Prompts prompts={agent.systemPrompts} /> : null}
      {tab === "配置" ? <Config agent={agent} /> : null}
      {tab === "文件" ? <Files agent={agent} /> : null}
    </article>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-5 items-center rounded-[12px] border border-border px-2">
      <span className="whitespace-nowrap text-[12px] leading-[18px] text-muted-foreground">{children}</span>
    </div>
  );
}

function prettyCatalogue(key: string) {
  return key.replaceAll("-", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function RenderedMarkdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">正在排版</p>}>
      <AgentMarkdown text={text} />
    </Suspense>
  );
}

function Overview({ agent }: { agent: Agent }) {
  if (agent.readme.trim()) return <RenderedMarkdown text={agent.readme} />;
  if (agent.description) return <p className="text-[14px] leading-[22px] text-foreground/80">{agent.description}</p>;
  return <p className="py-16 text-center text-sm text-muted-foreground">这位专家没有说明文档</p>;
}

function Prompts({ prompts }: { prompts: AgentPrompt[] }) {
  if (prompts.length === 0) return <p className="py-16 text-center text-sm text-muted-foreground">这位专家没有声明系统提示词</p>;
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">以下是从快照中读到的提示词文件，仅用于了解这位专家的行为，不会在这里执行。</p>
      {prompts.map((prompt) => (
        <section key={prompt.filename} className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[13px] font-medium text-foreground">
            <Bot aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {prompt.filename || "提示词"}
          </div>
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-6 text-foreground/90">{prompt.content}</pre>
        </section>
      ))}
    </div>
  );
}

function RefList({ title, icon, refs }: { title: string; icon: React.ReactNode; refs: AgentRef[] }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      {refs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">未声明</p>
      ) : (
        <ul className="space-y-2">
          {refs.map((ref) => (
            <li key={ref.name} className="rounded-lg bg-muted px-4 py-2.5">
              <span className="text-[14px] font-medium text-foreground">{ref.name}</span>
              {ref.description ? <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{ref.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Config({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-8">
      <RefList title="声明的技能" icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} refs={agent.skills} />
      <RefList title="声明的 MCP 服务" icon={<Wrench aria-hidden="true" className="h-4 w-4" />} refs={agent.mcps} />
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Cpu aria-hidden="true" className="h-4 w-4" />
          模型
        </h3>
        {agent.models.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">未声明</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {agent.models.map((model) => (
              <li key={`${model.supplier}-${model.name}`} className="rounded-lg bg-muted px-3 py-1.5 text-[13px] text-foreground">
                {model.name || "未命名"}
                {model.supplier ? <span className="ml-1.5 text-muted-foreground">{model.supplier}</span> : null}
                {model.protocol ? <span className="ml-1.5 rounded bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">{model.protocol}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Files({ agent }: { agent: Agent }) {
  return (
    <FileBrowser
      files={agent.files ?? []}
      emptyText="目录快照没有这位专家的文件文本"
      prefer={["agents.md", "readme.md"]}
    />
  );
}
