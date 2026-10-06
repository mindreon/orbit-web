import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { stripFrontmatter } from "../lib/display";

// Markdown pulls Mermaid's loader. Keep that off the entry chunk; the browser
// loads it when a markdown file is shown. SkillDetail renders the overview
// with the same module, so both share one chunk.
const Markdown = lazy(() => import("./markdown/Markdown").then((module) => ({ default: module.Markdown })));

export interface BrowserFile {
  path: string;
  body: string;
  /** 内容还没取回来时用它显示大小（字节）。 */
  size?: number;
}

type TreeNode = { name: string; path: string; type: "dir" | "file"; size: number; children: TreeNode[] };

/** 技能和智能体详情页共用的文件树：左侧树、点开预览，markdown 按渲染排版。 */
export function FileBrowser({
  files,
  emptyText = "目录快照没有文件文本",
  prefer = ["skill.md", "readme.md"],
  onOpen,
  loadingPath,
}: {
  files: BrowserFile[];
  emptyText?: string;
  prefer?: string[];
  /** 点开一个文件时通知调用方（内容按需取的场景）。 */
  onOpen?: (path: string) => void;
  /** 正在取内容的文件，预览里显示「正在读取」。 */
  loadingPath?: string | null;
}) {
  const entries = useMemo(() => files.map((file) => ({ path: file.path, size: file.size ?? new TextEncoder().encode(file.body).length })), [files]);
  const tree = useMemo(() => buildTree(entries), [entries]);
  // 只在文件列表变了时重置选中；按需取回内容只会改 body，不该把预览踢回文件树。
  const pathsKey = entries.map((item) => item.path).join("\n");
  const bodies = useMemo(() => new Map(files.map((file) => [fileKey(file.path), file.body])), [files]);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<"tree" | "preview">("tree");

  useEffect(() => {
    let preferred = null as string | null;
    for (const name of prefer) {
      preferred = entries.find((item) => item.path.toLowerCase() === name)?.path ?? null;
      if (preferred) break;
    }
    if (!preferred) preferred = entries[0]?.path ?? null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  if (entries.length === 0) {
    return <p className="flex h-[240px] items-center justify-center text-body text-muted-foreground">{emptyText}</p>;
  }
  if (mode === "preview" && selected) {
    return (
      <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
        <FilePreview path={selected} body={bodies.get(fileKey(selected))} loading={loadingPath === selected} onBack={() => setMode("tree")} />
      </div>
    );
  }
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
      <div className="shrink-0 bg-secondary px-4 py-2 text-small font-medium text-muted-foreground">共 {entries.length} 个文件</div>
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
              onOpen?.(path);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function RenderedMarkdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<p className="text-body text-muted-foreground">正在排版</p>}>
      <Markdown text={text} />
    </Suspense>
  );
}

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

function fileKey(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function previewKind(path: string) {
  const base = fileKey(path).slice(fileKey(path).lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot <= 0 ? "" : base.slice(dot + 1);
  if (ext === "md" || ext === "mdx") return "markdown";
  return "text";
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
        className={`flex cursor-pointer select-none items-center gap-2 rounded-control py-1.5 pr-3 text-body hover:bg-secondary ${active ? "bg-secondary" : ""}`}
        style={{ paddingLeft: 8 + 12 * depth }}
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
      >
        {isDir ? (
          <>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-primary-700" /> : <Folder className="h-4 w-4 shrink-0 text-primary-700" />}
            <span className="flex-1 truncate" title={node.name}>
              {node.name}
            </span>
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate" title={node.name}>
              {node.name}
            </span>
            <span className="shrink-0 text-caption text-muted-foreground">{formatFileSize(node.size)}</span>
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

function FilePreview({ path, body, loading, onBack }: { path: string; body?: string; loading?: boolean; onBack: () => void }) {
  const kind = previewKind(path);
  const text = body ? (kind === "markdown" ? stripFrontmatter(body) : body) : "";
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-secondary px-4 py-2">
        <button type="button" onClick={onBack} className="flex shrink-0 cursor-pointer items-center gap-1 text-body">
          返回文件树
        </button>
        <span className="mx-4 flex-1 truncate text-body text-muted-foreground" title={path}>
          {path}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="flex h-full min-h-[240px] items-center justify-center text-body text-muted-foreground">正在读取</p>
        ) : !text ? (
          <p className="flex h-full min-h-[240px] items-center justify-center text-body text-muted-foreground">暂不支持预览此类型文件</p>
        ) : kind === "markdown" ? (
          <div className="p-4">
            <RenderedMarkdown text={text} />
          </div>
        ) : (
          <pre className="m-4 overflow-auto rounded-control bg-card p-4 text-small text-foreground">
            <code>{text}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
