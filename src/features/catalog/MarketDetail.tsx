import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { describeFailure } from "../../api/errors";
import { FileTree } from "../../components/files/FileTree";
import { FilePreview } from "../../components/files/preview/FilePreview";
import { textSource } from "../../components/files/preview/sources";
import { Markdown } from "../../components/markdown/Markdown";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { Alert } from "../../ui/Alert";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { Skeleton } from "../../ui/Skeleton";

interface SkillFile {
  path: string;
  body: string;
}

interface SkillDetail {
  id: string;
  name: string;
  description: string;
  description_en?: string;
  category_name: string;
  downloads: number;
  likes: number;
  tags: string[];
  license?: string;
  icon_url?: string;
  source?: string;
  updated_at?: number;
}

interface MCPDetail {
  name: string;
  summary: string;
  author: string;
  hosted: boolean;
  readme: string;
  tools: { name: string; description: string }[];
}

const SKILL_TABS = ["概述", "文件"] as const;
type SkillTab = (typeof SKILL_TABS)[number];

export function SkillDetailPage() {
  const { handle = "", slug = "" } = useParams();
  const { currentTenant } = useIdentity();
  const path = `/market/skills/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  const skill = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "skill", { handle, slug }),
    queryFn: ({ signal }) => api.get<SkillDetail>(path, { signal }),
  });
  const files = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "skill-files", { handle, slug }),
    queryFn: ({ signal }) => api.get<{ items: SkillFile[] | null }>(`${path}/files`, { signal }),
  });
  const [tab, setTab] = useState<SkillTab>("概述");
  const item = skill.data;
  const texts = files.data?.items ?? [];
  return <div className="flex min-h-0 flex-1 flex-col bg-card">
    <PageHeader title="技能详情" back={{ to: "/skills", label: "技能" }} />
    <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1000px]">
        {skill.isPending || files.isPending ? <p className="text-body text-muted-foreground">正在读取</p> : null}
        {skill.error ? <Alert>{describeFailure("读取技能失败", skill.error)}</Alert> : null}
        {files.error ? <Alert>{describeFailure("读取技能文件失败", files.error)}</Alert> : null}
        {item && files.data ? <article>
          <SkillHeader skill={item} />
          <div className="relative mb-6 border-b border-border">
            <div className="flex items-center gap-16" role="tablist" aria-label="技能内容">
              {SKILL_TABS.map((name) => {
                const on = tab === name;
                return <button key={name} type="button" role="tab" aria-selected={on} className={`relative cursor-pointer pb-3 text-title font-medium leading-6 ${on ? "text-foreground" : "text-muted-foreground"}`} onClick={() => setTab(name)}>{name}{on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-foreground" /> : null}</button>;
              })}
            </div>
          </div>
          {tab === "概述" ? <SkillOverview skill={item} files={texts} /> : <SkillFileBrowser files={texts} />}
        </article> : null}
      </div>
    </div>
  </div>;
}

function SkillHeader({ skill }: { skill: SkillDetail }) {
  const color = skillTint(skill.name);
  const when = timeAgo(skill.updated_at ? skill.updated_at * 1000 : 0);
  const from = sourceLabel(skill.source ?? "");
  const summary = skillSummary(skill.description);
  return <header className="mb-8 md:mb-12">
    <div className="mb-7 flex items-center gap-4 md:gap-6">
      <SkillAvatar name={skill.name} src={safeIcon(skill.icon_url ?? "")} color={color} />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="min-w-0 text-heading font-semibold leading-7 text-foreground md:text-display md:leading-8">{skill.name}</h1>
        <div className="truncate font-mono text-small leading-5 text-muted-foreground" title={skill.id}>{skill.id}</div>
        <div className="flex flex-wrap items-center gap-4 text-caption font-medium leading-5 text-foreground">
          {from ? <span>来源 {from}</span> : null}
          {skill.likes > 0 ? <span className="text-muted-foreground">♥ {formatCount(skill.likes)}</span> : null}
          {skill.downloads > 0 ? <span className="text-muted-foreground">{formatCount(skill.downloads)} 次下载</span> : null}
          {skill.license ? <span className="text-muted-foreground">{skill.license}</span> : null}
        </div>
      </div>
    </div>
    {summary ? <p className="mb-4 text-body leading-6 text-gray-700 [word-break:break-word]">{summary}</p> : null}
    <div className="flex flex-wrap items-center gap-2">
      {skill.category_name ? <Pill>{skill.category_name}</Pill> : null}
      {skill.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
      {when ? <Pill>{`${when}更新`}</Pill> : null}
    </div>
  </header>;
}

function SkillOverview({ skill, files }: { skill: SkillDetail; files: SkillFile[] }) {
  const text = overviewBody(files);
  if (text) return <Markdown text={text} math={false} />;
  const fallback = skill.description_en || skill.description;
  if (fallback) return <p className="py-6 text-body leading-6 text-gray-700">{fallback}</p>;
  return <p className="py-16 text-center text-body text-muted-foreground">目录快照没有这份技能的文件文本，文档内容为空</p>;
}

function SkillFileBrowser({ files }: { files: SkillFile[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const bodies = useMemo(() => new Map(files.map((file) => [file.path, file.body])), [files]);
  const source = useMemo(() => {
    if (!selected) return null;
    const body = bodies.get(selected) ?? "";
    return textSource({ name: selected, size: new TextEncoder().encode(body).length }, body);
  }, [selected, bodies]);
  if (files.length === 0) return <p className="flex h-[240px] items-center justify-center text-body text-muted-foreground">目录快照没有这份技能的文件文本</p>;
  if (selected && source) {
    return <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
      <FilePreview source={source} assumeText hideFrontmatter onBack={() => setSelected(null)} />
    </div>;
  }
  return <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
    <div className="shrink-0 bg-secondary px-4 py-2 text-small font-medium text-muted-foreground">共 {files.length} 个文件</div>
    <FileTree className="flex-1 overflow-auto p-2" entries={files.map((file) => ({ path: file.path, size: new TextEncoder().encode(file.body).length }))} onOpen={(entry) => setSelected(entry.path)} />
  </div>;
}

function SkillAvatar({ name, src, color }: { name: string; src: string; color: { bg: string; fg: string } }) {
  const [failed, setFailed] = useState(!src);
  return <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control text-title font-medium" style={{ background: color.bg, color: color.fg }}>
    {name.trim().slice(0, 1) || "技"}
    {failed ? null : <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />}
  </span>;
}

function Pill({ children }: { children: string }) {
  return <div className="flex h-5 items-center rounded-full bg-secondary px-2"><span className="whitespace-nowrap text-caption leading-[18px] text-muted-foreground">{children}</span></div>;
}

function overviewBody(files: SkillFile[]) {
  for (const name of ["skill.md", "readme.md", "skills.md"]) {
    const hit = files.find((file) => file.path.toLowerCase() === name);
    if (hit?.body) return stripFrontmatter(hit.body);
  }
  return "";
}

function stripFrontmatter(text: string) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return text.trim();
  const rest = trimmed.slice(3);
  const close = /(^|\s)---(?=\s|$)/.exec(rest);
  const block = close ? rest.slice(0, close.index) : rest;
  const body = close ? rest.slice(close.index + close[0].length).trim() : "";
  if (body !== "") return body;
  const description = /(?:^|\s)description:\s*(.*?)\s*$/s.exec(block)?.[1] ?? "";
  return description.split(/\n\s*[A-Za-z_-]+:\s/)[0].trim();
}

function skillSummary(text: string) {
  return stripFrontmatter(text).replace(/\s+/g, " ").trim();
}

function timeAgo(ms: number) {
  if (!ms || ms <= 0) return "";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return "今天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} 千`;
  return String(Math.round(value));
}

function sourceLabel(source: string) {
  if (source === "nexa") return "NEXA";
  if (source === "common") return "ModelScope";
  return "";
}

const ICON_COLORS = [
  { bg: "rgba(0,122,255,0.12)", fg: "#007AFF" },
  { bg: "rgba(175,82,222,0.12)", fg: "#AF52DE" },
  { bg: "rgba(52,199,89,0.12)", fg: "#34C759" },
  { bg: "rgba(255,149,0,0.12)", fg: "#FF9500" },
];

function skillTint(name: string) {
  let n = 0;
  for (const ch of name) n += ch.charCodeAt(0);
  return ICON_COLORS[n % ICON_COLORS.length];
}

const ICON_HOSTS = new Set(["resouces.modelscope.cn", "resources.modelscope.cn", "img.alicdn.com"]);

function safeIcon(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !ICON_HOSTS.has(parsed.hostname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function MCPDetailPage() {
  const { id = "" } = useParams();
  const { currentTenant } = useIdentity();
  const query = useQuery({
    queryKey: qk.market(currentTenant?.id ?? null, "mcp", { id }),
    queryFn: ({ signal }) => api.get<MCPDetail>(`/market/mcp/${encodeURIComponent(id)}`, { signal }),
  });
  const item = query.data;
  return <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader title={item?.name || "MCP"} back={{ to: "/mcp", label: "MCP" }} />
    <PageBody>
      {query.isPending ? <Skeleton className="h-40" /> : query.error ? <Alert>{describeFailure("读取 MCP 失败", query.error)}</Alert> : item ? <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-body leading-6 text-foreground">{item.summary}</p>
        <p className="text-caption text-muted-foreground">{item.author} · {item.hosted ? "Hosted" : "Local"}</p>
        {item.tools.length ? <section>
          <h2 className="mb-2 text-small font-medium text-muted-foreground">工具</h2>
          <ul className="space-y-2">{item.tools.map((tool) => <li key={tool.name} className="rounded-card bg-card p-3"><p className="font-mono text-small font-medium">{tool.name}</p><p className="mt-1 text-small text-muted-foreground">{tool.description}</p></li>)}</ul>
        </section> : null}
        {item.readme ? <Markdown text={item.readme} math={false} /> : null}
      </article> : null}
    </PageBody>
  </div>;
}
