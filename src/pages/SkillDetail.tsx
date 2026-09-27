import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { describeRoomFailure, getSkill, listSkills, type Skill } from "../lib/rooms";
import { formatCount, formatUpdated, safeIcon, skillPath, sourceLabel, tint } from "./skillFormat";

const TABS = [
  { id: "overview", label: "概述" },
  { id: "files", label: "文件" },
  { id: "comments", label: "评论" },
  { id: "versions", label: "版本历史" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SkillDetailPage() {
  const params = useParams();
  const handle = params.handle ?? "";
  const slug = params.slug ?? "";
  const [skill, setSkill] = useState<Skill | null>(null);
  const [related, setRelated] = useState<Skill[]>([]);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setSkill(null);
    setRelated([]);
    setTab("overview");
    getSkill(handle, slug)
      .then((body) => {
        if (gone) return;
        setSkill(body);
        setError("");
        if (!body.category) return;
        return listSkills({ category: body.category }).then((page) => {
          if (gone) return;
          const others = (page.items ?? []).filter((item) => item.id !== body.id).slice(0, 4);
          setRelated(others);
        });
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeRoomFailure("读取技能失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [handle, slug]);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f8] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <nav className="flex items-center gap-2 text-sm text-[#666]" aria-label="面包屑">
          <Link to="/experts/skills" aria-label="返回技能目录" className="rounded-lg px-2 py-1 hover:bg-white">
            返回
          </Link>
          <Link to="/experts/skills" className="hover:text-[#1a1a1a]">
            技能
          </Link>
          <span>/</span>
          <span className="text-[#1a1a1a]">{slug}</span>
        </nav>
        {loading ? <p className="mt-6 text-sm text-[#888]">正在读取</p> : null}
        {error ? <p className="mt-6 text-sm text-[#c04545]">{error}</p> : null}
        {skill ? <DetailBody skill={skill} related={related} tab={tab} onTab={setTab} /> : null}
      </div>
    </div>
  );
}

function DetailBody({ skill, related, tab, onTab }: { skill: Skill; related: Skill[]; tab: TabId; onTab: (tab: TabId) => void }) {
  const color = tint(skill.name);
  const icon = safeIcon(skill.iconUrl);
  const category = skill.categoryName || skill.category;
  const from = sourceLabel(skill.source);
  const updated = formatUpdated(skill.updatedAt);

  return (
    <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article>
        <header className="rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white px-6 py-6">
          <div className="flex items-start gap-4">
            {icon ? (
              <img src={icon} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-medium" style={{ background: color.bg, color: color.fg }}>
                {skill.name.trim().slice(0, 1) || "技"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-medium leading-7">{skill.name}</h1>
              <p className="mt-1 font-mono text-sm text-[#888]">
                @{skill.handle}/{skill.slug}
              </p>
            </div>
            {skill.version ? <span className="rounded-full bg-[#f3f3f4] px-2.5 py-1 text-xs text-[#444]">v{skill.version}</span> : null}
          </div>
          <p className="mt-4 flex flex-wrap gap-4 text-sm text-[#666]">
            <span>{formatCount(skill.downloads)} 次下载</span>
            <span>{formatCount(skill.stars)} 次收藏</span>
            {category ? <span>{category}</span> : null}
            {from ? <span>{from}</span> : null}
          </p>
          {skill.description ? <p className="mt-4 text-sm leading-6 text-[#444]">{skill.description}</p> : null}
        </header>

        <div role="tablist" aria-label="技能内容" className="mt-6 flex gap-2 border-b border-[rgba(0,0,0,0.06)]">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`h-9 px-3 text-sm ${tab === item.id ? "border-b-2 border-[#1a1a1a] font-medium text-[#1a1a1a]" : "text-[#888]"}`}
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4 rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white px-6 py-5 text-sm leading-6 text-[#444]">
          {tab === "overview" ? (
            <>
              <p>{skill.description || "本地目录里还没有这段介绍。"}</p>
              <p className="mt-3 text-[#888]">这是同步时保存的介绍。技能包里的文件没有下载到这边。</p>
            </>
          ) : null}
          {tab === "files" ? <p>本地目录没有保存技能文件，也不会下载技能包。</p> : null}
          {tab === "comments" ? <p>本地目录没有保存评论。</p> : null}
          {tab === "versions" ? <p>{skill.version ? `已保存的版本是 v${skill.version}。` : "还没有保存版本号。"}更早的版本记录没有同步过来。</p> : null}
        </div>

        {related.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-medium">相关推荐</h2>
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {related.map((item) => (
                <li key={item.id}>
                  <Link to={skillPath(item.handle, item.slug)} className="block rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white px-4 py-4 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#888]">{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <aside className="h-fit rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white px-5 py-5">
        <p className="text-sm leading-6 text-[#444]">此页面只展示已保存的目录，不会安装技能，也不会下载技能包。</p>
        <dl className="mt-4 space-y-3 text-sm">
          <Stat label="分类" value={category || "未分类"} />
          <Stat label="来源" value={from || "SkillHub"} />
          <Stat label="版本" value={skill.version ? `v${skill.version}` : "未知"} />
          {updated ? <Stat label="更新" value={updated} /> : null}
          <Stat label="下载" value={formatCount(skill.downloads)} />
          <Stat label="收藏" value={formatCount(skill.stars)} />
          <Stat label="需要密钥" value={skill.requiresApiKey ? "是" : "否"} />
          <Stat label="付费" value={skill.paid ? "是" : "否"} />
        </dl>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[#888]">{label}</dt>
      <dd className="text-right text-[#1a1a1a]">{value}</dd>
    </div>
  );
}
