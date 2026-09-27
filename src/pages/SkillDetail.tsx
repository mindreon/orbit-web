import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { Markdown } from "../chat/markdown/Markdown";
import { describeRoomFailure, getSkill, listSkillFiles, type Skill, type SkillPageMeta, type SkillTextFile } from "../lib/rooms";
import { safeIcon, sourceLabel, timeAgo } from "./skillFormat";

const TABS = ["概述", "文件", "版本历史", "评测报告"] as const;
type Tab = (typeof TABS)[number];

const TRACE = [
  { key: "T", color: "#10B981", gradient: "linear-gradient(90deg, #08a050, #34c77b)" },
  { key: "R", color: "#3B82F6", gradient: "linear-gradient(90deg, #007aff, #5ac8fa)" },
  { key: "A", color: "#F59E0B", gradient: "linear-gradient(90deg, #ff9500, #ffd60a)" },
  { key: "C", color: "#8B5CF6", gradient: "linear-gradient(90deg, #af52de, #da8fff)" },
  { key: "E", color: "#EF4444", gradient: "linear-gradient(90deg, #ff3b30, #ff6b6b)" },
];

/** 详情页只保留 SkillHub 技能页的主栏。评论和右侧安装栏不放进来。 */
export function SkillDetailPage() {
  const params = useParams();
  const handle = params.handle ?? "";
  const slug = params.slug ?? "";
  const [skill, setSkill] = useState<Skill | null>(null);
  const [files, setFiles] = useState<SkillTextFile[] | null>(null);
  const [meta, setMeta] = useState<SkillPageMeta | undefined>();
  const [tab, setTab] = useState<Tab>("概述");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setSkill(null);
    setFiles(null);
    setMeta(undefined);
    setTab("概述");
    setError("");
    getSkill(handle, slug)
      .then((body) => {
        if (gone) return;
        setSkill(body);
        return listSkillFiles(body.handle, body.slug).then((page) => {
          if (gone) return;
          setFiles(page.items ?? []);
          setMeta(page.meta);
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
    <div className="min-h-0 flex-1 overflow-auto bg-white px-6 py-6">
      <div className="mx-auto max-w-[1000px]" style={{ fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif' }}>
        <nav className="mb-6 flex items-center gap-2 text-sm text-[rgba(0,0,0,0.55)]" aria-label="面包屑">
          <Link to="/experts/skills" aria-label="返回技能目录" className="rounded-lg px-2 py-1 hover:bg-black/[0.04]">
            返回
          </Link>
        </nav>
        {loading ? <p className="text-sm text-[rgba(0,0,0,0.45)]">正在读取</p> : null}
        {error ? <p className="text-sm text-[#c04545]">{error}</p> : null}
        {skill && files ? <Detail skill={skill} files={files} meta={meta} tab={tab} onTab={setTab} /> : null}
      </div>
    </div>
  );
}

function Detail({
  skill,
  files,
  meta,
  tab,
  onTab,
}: {
  skill: Skill;
  files: SkillTextFile[];
  meta?: SkillPageMeta;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  return (
    <article>
      <SkillHeader skill={skill} meta={meta} />
      <div className="relative mb-6 border-b border-[rgba(0,0,0,0.08)]">
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
                className={`relative cursor-pointer pb-3 text-[16px] font-medium leading-6 ${on ? "text-[rgba(0,0,0,0.9)]" : "text-[rgba(0,0,0,0.6)]"}`}
              >
                {name}
                {on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-[rgba(0,0,0,0.9)]" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "概述" ? <Overview files={files} /> : null}
      {tab === "文件" ? <FileTab files={files} meta={meta} /> : null}
      {tab === "版本历史" ? <Versions meta={meta} fallback={skill.version} /> : null}
      {tab === "评测报告" ? <Evaluation meta={meta} /> : null}
    </article>
  );
}

function SkillHeader({ skill, meta }: { skill: Skill; meta?: SkillPageMeta }) {
  const icon = safeIcon(skill.iconUrl);
  const canonical = skill.handle ? `@${skill.handle}/${skill.slug}` : skill.slug;
  const summary = meta?.summaryZh || meta?.summary || skill.description;
  const category = skill.categoryName || skill.category;
  const subs = (meta?.subCategories ?? []).filter((item) => item.name && item.name !== category);
  const when = timeAgo(meta?.versionCreatedAt || meta?.updatedAt || Date.parse(skill.updatedAt));
  const version = meta?.version || skill.version;
  const from = sourceLabel(skill.source);

  return (
    <header className="mb-8 md:mb-12">
      <div className="mb-7 flex items-center gap-4 md:gap-6">
        {icon ? (
          <img src={icon} alt="" className="h-12 w-12 shrink-0 rounded-[5.4px] object-cover" />
        ) : (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[5.4px] border border-[#BAC5FF] text-lg font-medium"
            style={{ background: "#D8DEFF", color: "#3F5EFF" }}
          >
            {(skill.name.trim().slice(0, 1) || "技")}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="min-w-0 text-[18px] font-medium leading-7 tracking-[-0.01em] text-black md:text-[24px] md:leading-8">{skill.name}</h1>
          <div className="truncate font-mono text-[13px] leading-5 text-[rgba(0,0,0,0.55)]" title={canonical}>
            {canonical}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {typeof meta?.score === "number" ? <StarRating score={meta.score} /> : null}
            {meta?.safe ? <SafeBadge /> : null}
            {skill.source === "clawhub" ? (
              <span className="flex items-center gap-1 text-[12px] font-medium leading-5 text-[rgba(0,0,0,0.9)]">
                <img src="https://cloudcache.tencent-cloud.com/qcloud/ui/static/other_external_resource/418e3d84-7236-44df-8620-e4bb5dc15289.png" alt="" className="h-4 w-4 shrink-0 object-contain" />
                源自 Clawhub · 高速下载
              </span>
            ) : null}
            {skill.source === "community" ? (
              <span className="flex items-center gap-1.5 text-[12px] font-medium leading-5 text-[rgba(0,0,0,0.9)]">
                <img src="https://cloudcache.tencent-cloud.com/qcloud/ui/static/other_external_resource/e50539a0-8e4a-4399-842c-8da92ad55873.svg" alt="" className="h-4 w-4 shrink-0" />
                源自 SkillHub
              </span>
            ) : null}
            {from && skill.source === "enterprise" ? <span className="text-[12px] font-medium text-[rgba(0,0,0,0.9)]">企业</span> : null}
          </div>
        </div>
      </div>
      {summary ? <p className="mb-4 text-[14px] leading-[22px] tracking-[-0.01em] text-[rgba(0,0,0,0.7)] [word-break:break-word]">{summary}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {category ? <Pill>{category}</Pill> : null}
        {subs.map((item) => (
          <Pill key={item.key}>{item.name}</Pill>
        ))}
        {when ? <Pill>{when}更新</Pill> : null}
        {version ? <Pill>v{version}</Pill> : null}
      </div>
    </header>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-5 items-center rounded-[12px] border border-[rgba(0,0,0,0.08)] px-2">
      <span className="whitespace-nowrap text-[12px] leading-[18px] text-[rgba(0,0,0,0.4)]">{children}</span>
    </div>
  );
}

function StarRating({ score }: { score: number }) {
  const full = Math.floor(score);
  const half = score - full >= 0.3;
  return (
    <div className="flex items-center gap-1.5" aria-label={`${score.toFixed(1)} 优秀`}>
      <div className="flex items-center" style={{ gap: 3 }}>
        {Array.from({ length: 5 }, (_, index) => {
          const filled = index < full;
          const partial = !filled && half && index === full;
          const fill = filled ? "#FBBC05" : partial ? `url(#star-half-${index})` : "rgba(0,0,0,0.1)";
          return (
            <svg key={index} width="12" height="11" viewBox="0 0 12 11" fill="none" aria-hidden="true">
              {partial ? (
                <defs>
                  <linearGradient id={`star-half-${index}`}>
                    <stop offset="50%" stopColor="#FBBC05" />
                    <stop offset="50%" stopColor="rgba(0,0,0,0.1)" />
                  </linearGradient>
                </defs>
              ) : null}
              <path d="M6 0L7.469 4.531H12L8.265 7.328L9.735 11L6 8.203L2.265 11L3.735 7.328L0 4.531H4.531L6 0Z" fill={fill} />
            </svg>
          );
        })}
      </div>
      <span className="text-[12px] font-medium leading-5 text-[#050505]">{score.toFixed(1)} 优秀</span>
      <span className="text-[12px] leading-5 text-[rgba(0,0,0,0.3)]">(AI 评分)</span>
    </div>
  );
}

function SafeBadge() {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M3.15256 2.35466L10 0.833008L16.8474 2.35466C17.2287 2.43939 17.5 2.77757 17.5 3.16815V11.4904C17.5 13.1622 16.6645 14.7233 15.2735 15.6507L10 19.1663L4.7265 15.6507C3.33551 14.7233 2.5 13.1622 2.5 11.4904V3.16815C2.5 2.77757 2.77128 2.43939 3.15256 2.35466ZM10.8333 8.33301V4.16634L6.66667 9.99967H9.16667V14.1663L13.3333 8.33301H10.8333Z"
          fill="url(#shield-header)"
        />
        <defs>
          <linearGradient id="shield-header" x1="10" y1="0.833" x2="10" y2="19.166" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A6E527" />
            <stop offset="1" stopColor="#0CBF5B" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-[12px] font-medium leading-5 text-[#050505]">安全</span>
    </div>
  );
}

function stripFrontmatter(text: string) {
  return text.replace(/^\s*---\s*\n[\s\S]*?\n---\s*\n?/, "").trimStart();
}

function overviewBody(files: SkillTextFile[]) {
  for (const name of ["skill.md", "readme.md", "skills.md"]) {
    const hit = files.find((file) => file.path.toLowerCase() === name);
    if (hit?.body) return stripFrontmatter(hit.body);
  }
  return "";
}

function Overview({ files }: { files: SkillTextFile[] }) {
  const text = overviewBody(files);
  if (!text) return <p className="py-16 text-center text-sm text-[rgba(0,0,0,0.45)]">文档内容为空</p>;
  return <Markdown text={text} />;
}

type TreeNode = { name: string; path: string; type: "dir" | "file"; size: number; children: TreeNode[] };

function buildTree(entries: { path: string; size: number }[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";
    parts.forEach((part, index) => {
      acc = acc ? `${acc}/${part}` : part;
      const last = index === parts.length - 1;
      let node = level.find((item) => item.name === part && item.type === (last ? "file" : "dir"));
      if (!node) {
        node = { name: part, path: acc, type: last ? "file" : "dir", size: last ? entry.size : 0, children: [] };
        level.push(node);
      }
      if (!last) level = node.children;
    });
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-Hans", { numeric: true });
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root);
  return root;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function previewKind(path: string) {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot <= 0 ? "" : base.slice(dot + 1);
  if (ext === "md" || ext === "mdx") return "markdown";
  const text = new Set(["txt", "json", "yaml", "yml", "toml", "py", "js", "ts", "tsx", "jsx", "css", "html", "xml", "csv", "sh"]);
  if (text.has(ext)) return "text";
  return "unsupported";
}

function FileTab({ files, meta }: { files: SkillTextFile[]; meta?: SkillPageMeta }) {
  const entries = useMemo(() => {
    if (meta?.fileIndex && meta.fileIndex.length > 0) return meta.fileIndex.map((item) => ({ path: item.path, size: item.size }));
    return files.map((file) => ({ path: file.path, size: new TextEncoder().encode(file.body).length }));
  }, [files, meta]);
  const tree = useMemo(() => buildTree(entries), [entries]);
  const bodies = useMemo(() => new Map(files.map((file) => [file.path, file.body])), [files]);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<"tree" | "preview">("tree");

  useEffect(() => {
    const preferred = entries.find((item) => item.path.toLowerCase() === "skill.md")?.path ?? entries[0]?.path ?? null;
    setSelected(preferred);
    setMode("tree");
    if (!preferred) return;
    const ancestors = new Set<string>();
    const parts = preferred.split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      ancestors.add(acc);
    }
    setOpen(ancestors);
  }, [entries]);

  if (entries.length === 0) {
    return <p className="flex h-[240px] items-center justify-center text-sm text-[rgba(0,0,0,0.45)]">该版本暂未提供可预览文件</p>;
  }
  if (mode === "preview" && selected) {
    return (
      <div className="flex h-[70vh] flex-col overflow-hidden rounded border border-[rgba(0,0,0,0.08)]">
        <FilePreview path={selected} body={bodies.get(selected)} onBack={() => setMode("tree")} />
      </div>
    );
  }
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded border border-[rgba(0,0,0,0.08)]">
      <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-4 py-2 text-sm text-[rgba(0,0,0,0.45)]">共 {entries.length} 个文件</div>
      <div role="tree" className="flex-1 overflow-auto p-2">
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            selected={selected}
            open={open}
            onToggle={(path) => {
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            }}
            onSelect={(path) => {
              setSelected(path);
              setMode("preview");
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  selected,
  open,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  open: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = isDir && open.has(node.path);
  const active = !isDir && selected === node.path;
  return (
    <>
      <div
        role="treeitem"
        aria-selected={active || undefined}
        aria-expanded={isDir ? expanded : undefined}
        className={`flex cursor-pointer select-none items-center gap-2 rounded py-1.5 pr-3 text-sm hover:bg-neutral-100 ${active ? "bg-neutral-100" : ""}`}
        style={{ paddingLeft: 8 + 12 * depth }}
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
      >
        {isDir ? (
          <>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[rgba(0,0,0,0.45)] transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" /> : <Folder className="h-4 w-4 shrink-0 text-blue-500" />}
            <span className="flex-1 truncate" title={node.name}>
              {node.name}
            </span>
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className="h-4 w-4 shrink-0 text-[rgba(0,0,0,0.45)]" />
            <span className="flex-1 truncate" title={node.name}>
              {node.name}
            </span>
            <span className="shrink-0 text-xs text-[rgba(0,0,0,0.45)]">{formatFileSize(node.size)}</span>
          </>
        )}
      </div>
      {expanded
        ? node.children.map((child) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} selected={selected} open={open} onToggle={onToggle} onSelect={onSelect} />
          ))
        : null}
    </>
  );
}

function FilePreview({ path, body, onBack }: { path: string; body?: string; onBack: () => void }) {
  const kind = previewKind(path);
  const text = body ? (kind === "markdown" ? stripFrontmatter(body) : body) : "";
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-2">
        <button type="button" onClick={onBack} className="flex shrink-0 cursor-pointer items-center gap-1 text-sm">
          返回文件树
        </button>
        <span className="mx-4 flex-1 truncate text-sm text-[rgba(0,0,0,0.45)]" title={path}>
          {path}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {!text ? (
          <p className="flex h-full min-h-[240px] items-center justify-center text-sm text-[rgba(0,0,0,0.45)]">这份文本没有留在本地目录里。</p>
        ) : kind === "unsupported" ? (
          <p className="flex h-full min-h-[240px] items-center justify-center text-sm text-[rgba(0,0,0,0.45)]">暂不支持预览此类型文件</p>
        ) : kind === "markdown" ? (
          <div className="p-4">
            <Markdown text={text} />
          </div>
        ) : (
          <pre className="m-4 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-900">
            <code>{text}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

function Versions({ meta, fallback }: { meta?: SkillPageMeta; fallback: string }) {
  const rows = meta?.versions?.length ? meta.versions : fallback ? [{ version: fallback, changelog: "", createdAt: meta?.updatedAt }] : [];
  const [open, setOpen] = useState<Set<string>>(() => new Set(rows.slice(0, 3).map((row) => row.version)));
  if (rows.length === 0) return <p className="py-16 text-center text-sm text-[rgba(0,0,0,0.45)]">暂无版本历史</p>;
  return (
    <div className="space-y-6 pl-6">
      {rows.map((row, index) => {
        const expanded = open.has(row.version);
        const date = row.createdAt ? new Date(row.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
        return (
          <div key={`${row.version}-${index}`} className="relative">
            <div className={`absolute -left-[25px] top-1.5 h-3 w-3 rounded-full border-2 ${index === 0 ? "border-[#202020] bg-[#202020]" : "border-[rgba(0,0,0,0.15)] bg-white"}`} />
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-3 text-left"
              onClick={() => {
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.version)) next.delete(row.version);
                  else next.add(row.version);
                  return next;
                });
              }}
            >
              <span className="text-[15px] font-semibold text-[rgba(0,0,0,0.9)]">v{row.version}</span>
              {index === 0 ? <span className="rounded-full bg-[#202020] px-2 py-0.5 text-[11px] font-medium text-white">最新</span> : null}
              {date ? <span className="ml-auto text-[13px] text-[rgba(0,0,0,0.3)]">{date}</span> : null}
              <ChevronRight className={`h-4 w-4 text-[rgba(0,0,0,0.3)] transition-transform ${expanded ? "rotate-180" : "rotate-90"}`} />
            </button>
            {expanded && row.changelog ? (
              <div className="mt-3 max-h-[100px] overflow-y-auto border-l-2 border-[rgba(0,0,0,0.04)] pl-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-[rgba(0,0,0,0.5)]">{row.changelog}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function grade(score: number) {
  if (score >= 4) return "优秀";
  if (score >= 3) return "良好";
  if (score >= 2) return "及格";
  return "待改进";
}

function Evaluation({ meta }: { meta?: SkillPageMeta }) {
  const evaln = meta?.evaluation;
  const dimensions = evaln?.dimensions ?? [];
  if (!evaln || dimensions.length === 0) {
    return <p className="py-16 text-center text-sm text-[rgba(0,0,0,0.45)]">该 Skill 暂未进行评测</p>;
  }
  const total = typeof meta?.score === "number" ? meta.score : evaln.score;
  const when = evaln.createdAt ? new Date(evaln.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  return (
    <div className="pb-8">
      <div className="mb-8 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(63,94,255,0.16)" }}>
        <div className="h-1" style={{ background: "linear-gradient(90deg, rgb(63, 94, 255) 0%, rgb(175, 82, 222) 100%)" }} />
        <div className="p-5" style={{ background: "linear-gradient(135deg, rgba(63,94,255,0.04) 0%, rgba(175,82,222,0.04) 100%)" }}>
          <h3 className="mb-1.5 text-[15px] font-semibold text-gray-900">TRACE 评测维度说明</h3>
          <p className="text-[13px] leading-relaxed text-gray-600">
            SkillHub TRACE 评测体系从<span className="font-medium text-gray-800">可信任度（Trust）</span>、
            <span className="font-medium text-gray-800">可靠性（Reliability）</span>、
            <span className="font-medium text-gray-800">适用性（Adaptability）</span>、
            <span className="font-medium text-gray-800">规范性（Convention）</span>、
            <span className="font-medium text-gray-800">有效性（Effectiveness）</span>
            五个维度评估 Skill 的质量。评测主要基于 AI 自动化检测，结果供参考。
          </p>
          {when ? <p className="mt-2 text-[12px] text-gray-500">评测时间 {when}</p> : null}
        </div>
      </div>
      <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-8 md:flex-row">
          <Radar scores={dimensions.map((item) => item.score)} labels={dimensions.map((item) => `${item.key} ${item.labelZh}`)} />
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-[48px] font-bold leading-none text-gray-900">{total.toFixed(1)}</span>
              <span className="text-[16px] font-medium text-gray-400">/ 5</span>
            </div>
            <div className="mb-3">
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[12px] font-medium text-indigo-700">综合评级：{grade(total)}</span>
            </div>
            {evaln.userSummary ? <p className="text-[14px] leading-relaxed text-gray-600">{evaln.userSummary}</p> : null}
          </div>
        </div>
      </div>
      <h3 className="mb-4 text-[16px] font-semibold text-gray-900">评测详情</h3>
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="space-y-5">
          {dimensions.map((item, index) => {
            const paint = TRACE.find((row) => row.key === item.key) ?? TRACE[0];
            return (
              <div key={item.key}>
                {index > 0 ? <div className="mb-5 border-t border-gray-100" /> : null}
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold" style={{ backgroundColor: `${paint.color}15`, color: paint.color }}>
                    {item.key}
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[14px] font-semibold text-gray-900">
                      {item.key} · {item.label}
                    </span>
                    <span className="text-[12px] text-gray-500">{item.labelZh}</span>
                  </div>
                </div>
                <div className="mb-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (item.score / 5) * 100))}%`, background: paint.gradient }} />
                  </div>
                  <span className="whitespace-nowrap text-[13px] font-semibold text-gray-700">
                    {item.score.toFixed(1)}
                    <span className="text-[12px] text-gray-400"> /5</span>
                  </span>
                </div>
                {item.summary ? <p className="text-[13px] leading-relaxed text-gray-600">{item.summary}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Radar({ scores, labels }: { scores: number[]; labels: string[] }) {
  const cx = 150;
  const cy = 118;
  const radius = 78;
  const count = Math.max(scores.length, 1);
  const angle = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const point = (index: number, value: number) => {
    const span = (Math.max(0, Math.min(5, value)) / 5) * radius;
    return [cx + span * Math.cos(angle(index)), cy + span * Math.sin(angle(index))];
  };
  const ring = (scale: number) =>
    scores
      .map((_, index) => point(index, 5 * scale).join(","))
      .join(" ");
  const shape = scores.map((score, index) => point(index, score).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 240" className="h-[240px] w-full max-w-[320px] shrink-0" role="img" aria-label="评测雷达图">
      {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
        <polygon key={scale} points={ring(scale)} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
      ))}
      {scores.map((_, index) => {
        const [x, y] = point(index, 5);
        return <line key={index} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />;
      })}
      <polygon points={shape} fill="#6366F1" fillOpacity="0.2" stroke="#6366F1" strokeWidth="2" />
      {labels.map((label, index) => {
        const [x, y] = point(index, 5.7);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#4B5563">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
