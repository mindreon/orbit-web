import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FileTree } from "./files/FileTree";
import { FilePreview } from "./files/preview/FilePreview";
import { textSource } from "./files/preview/sources";

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
  // 只在文件列表变了时重置选中；按需取回内容只会改 body，不该把预览踢回文件树。
  const pathsKey = entries.map((item) => item.path).join("\n");
  const bodies = useMemo(() => new Map(files.map((file) => [fileKey(file.path), file.body])), [files]);
  const [selected, setSelected] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  if (entries.length === 0) {
    return <p className="flex h-[240px] items-center justify-center text-body text-muted-foreground">{emptyText}</p>;
  }
  if (mode === "preview" && selected) {
    return (
      <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
        <BrowserPreview path={selected} body={bodies.get(fileKey(selected))} size={entries.find((item) => item.path === selected)?.size} pending={loadingPath === selected} onBack={() => setMode("tree")} />
      </div>
    );
  }
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-card bg-muted">
      <div className="shrink-0 bg-secondary px-4 py-2 text-small font-medium text-muted-foreground">共 {entries.length} 个文件</div>
      <FileTree
        className="flex-1 overflow-auto p-2"
        entries={entries}
        selected={selected}
        reveal={selected}
        onOpen={(entry) => {
          setSelected(entry.path);
          setMode("preview");
          onOpen?.(entry.path);
        }}
      />
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

function fileKey(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

/** 选中文件的预览：内容已经在内存里（专家文件是点开才取回来的，取回前 `pending`），其余交给共用的 FilePreview。 */
function BrowserPreview({ path, body, size, pending, onBack }: { path: string; body?: string; size?: number; pending: boolean; onBack: () => void }) {
  const source = useMemo(() => textSource({ name: fileKey(path), size }, body ?? ""), [path, body, size]);
  return <FilePreview key={path} source={source} assumeText hideFrontmatter pending={pending} onBack={onBack} />;
}
