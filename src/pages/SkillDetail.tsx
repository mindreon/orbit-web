import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "../ui/Alert";
import { PageHeader } from "../ui/PageHeader";
import { useParams } from "react-router";
import { describeFailure } from "../lib/api";
import { getSkill, listSkillFiles, type Skill, type SkillTextFile } from "../lib/catalog";
import { FileBrowser, RenderedMarkdown } from "../components/FileBrowser";
import { expertSummary, stripFrontmatter } from "../lib/display";
import { CatalogAvatar } from "../components/CatalogAvatar";
import { formatCount, sourceLabel, timeAgo, tint } from "./skillFormat";
import { skillIconPath } from "../lib/catalog";

const TABS = ["概述", "文件"] as const;
type Tab = (typeof TABS)[number];

/** 详情页只保留技能页的主栏：概述和文件。快照里没有的评分、版本、评测不再展示。 */
export function SkillDetailPage() {
  const params = useParams();
  const handle = params.handle ?? "";
  const slug = params.slug ?? "";
  const [skill, setSkill] = useState<Skill | null>(null);
  const [files, setFiles] = useState<SkillTextFile[] | null>(null);
  const [tab, setTab] = useState<Tab>("概述");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setSkill(null);
    setFiles(null);
    setTab("概述");
    setError("");
    getSkill(handle, slug)
      .then((body) => {
        if (gone) return;
        setSkill(body);
        return listSkillFiles(body.handle, body.slug).then((page) => {
          if (gone) return;
          setFiles(page.items ?? []);
        });
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取技能失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [handle, slug]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="技能详情" back={{ to: "/experts/skills", label: "技能" }} />
      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1000px]" style={{ fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif' }}>
        {loading ? <p className="text-body text-muted-foreground">正在读取</p> : null}
        {error ? <Alert>{error}</Alert> : null}
        {skill && files ? <Detail skill={skill} files={files} tab={tab} onTab={setTab} /> : null}
      </div>
      </div>
    </div>
  );
}

function Detail({ skill, files, tab, onTab }: { skill: Skill; files: SkillTextFile[]; tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <article>
      <SkillHeader skill={skill} />
      <div className="relative mb-6 border-b border-border">
        <div className="flex items-center gap-16" role="tablist" aria-label="技能内容">
          {TABS.map((name) => {
            const on = tab === name;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab(name)}
                className={`relative cursor-pointer pb-3 text-title font-medium leading-6 ${on ? "text-foreground" : "text-muted-foreground"}`}
              >
                {name}
                {on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-foreground" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "概述" ? <Overview files={files} skill={skill} /> : null}
      {tab === "文件" ? <FileBrowser files={files} emptyText="目录快照没有这份技能的文件文本" /> : null}
    </article>
  );
}

function SkillHeader({ skill }: { skill: Skill }) {
  const color = tint(skill.name);
  const category = skill.categoryName || skill.category;
  const when = timeAgo(Date.parse(skill.updatedAt));
  const from = sourceLabel(skill.source);

  return (
    <header className="mb-8 md:mb-12">
      <div className="mb-7 flex items-center gap-4 md:gap-6">
        <CatalogAvatar
          src={skillIconPath(skill.handle, skill.slug)}
          fallback={skill.name}
          fallbackChar="技"
          className="h-12 w-12 rounded-control text-title font-medium"
          style={{ background: color.bg, color: color.fg }}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="min-w-0 text-heading font-semibold leading-7 text-foreground md:text-display md:leading-8">{skill.name}</h1>
          <div className="truncate font-mono text-small leading-5 text-muted-foreground" title={skill.id}>
            {skill.id}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-caption font-medium leading-5 text-foreground">
            {from ? <span>来源 {from}</span> : null}
            {skill.likes > 0 ? <span className="text-muted-foreground">♥ {formatCount(skill.likes)}</span> : null}
            {skill.downloads > 0 ? <span className="text-muted-foreground">{formatCount(skill.downloads)} 次下载</span> : null}
            {skill.license ? <span className="text-muted-foreground">{skill.license}</span> : null}
          </div>
        </div>
      </div>
      {expertSummary(skill.description) ? <p className="mb-4 text-body leading-6 text-gray-700 [word-break:break-word]">{expertSummary(skill.description)}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {category ? <Pill>{category}</Pill> : null}
        {skill.tags.map((tag) => (
          <Pill key={tag}>{tag}</Pill>
        ))}
        {when ? <Pill>{when}更新</Pill> : null}
      </div>
    </header>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-5 items-center rounded-full bg-secondary px-2">
      <span className="whitespace-nowrap text-caption leading-[18px] text-muted-foreground">{children}</span>
    </div>
  );
}

function overviewBody(files: SkillTextFile[]) {
  for (const name of ["skill.md", "readme.md", "skills.md"]) {
    const hit = files.find((file) => file.path.toLowerCase() === name);
    if (hit?.body) return stripFrontmatter(hit.body);
  }
  return "";
}

function Overview({ files, skill }: { files: SkillTextFile[]; skill: Skill }) {
  const text = overviewBody(files);
  if (text) return <RenderedMarkdown text={text} />;
  if (skill.descriptionEn || skill.description) {
    return <p className="py-6 text-body leading-6 text-gray-700">{skill.descriptionEn || skill.description}</p>;
  }
  return <p className="py-16 text-center text-body text-muted-foreground">目录快照没有这份技能的文件文本，文档内容为空</p>;
}
