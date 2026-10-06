import { Check, ChevronRight, Copy, Download, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { describeFailure } from "../../lib/api";
import { fileKind, type ArtifactFile } from "../../lib/artifacts";
import { cn } from "../../lib/cn";
import { getArtifactURL } from "../../lib/tasks";
import { formatSize } from "../../lib/time";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { RichText } from "../markdown/RichText";

/** 超过这个大小的文本不在页面里取回来渲染，直接给下载。 */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

type Loaded = { readonly url: string; readonly text: string | null };

async function load(file: ArtifactFile): Promise<Loaded> {
  const url = await getArtifactURL(file.manifestId, file.name);
  const kind = fileKind(file.name, file.mediaType);
  const wantsText = kind === "html" || kind === "markdown" || kind === "text";
  if (!wantsText || file.size > MAX_TEXT_BYTES) return { url, text: null };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { url, text: await response.text() };
}

const ACTION = "flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200";

/** 路径在最后一个斜杠处分成「所在目录」和文件名；文件在根上时目录为空。 */
function splitPath(name: string): { dir: string; base: string } {
  const cut = name.lastIndexOf("/");
  return cut < 0 ? { dir: "", base: name } : { dir: name.slice(0, cut), base: name.slice(cut + 1) };
}

/**
 * 面包屑：目录淡色，放不下就从开头截（direction:rtl 让省略号出现在左边，里面的 bdi 保持路径自己的从左到右），
 * 后面是 ›，最后是加粗的文件名。
 */
function Breadcrumb({ name }: { name: string }) {
  const { dir, base } = splitPath(name);
  return (
    <p data-testid="preview-path" title={name} className="flex min-w-0 flex-1 items-center gap-1 text-body">
      {dir ? (
        <>
          <span data-testid="preview-dir" className="min-w-0 truncate text-left text-muted-foreground [direction:rtl]">
            <bdi dir="ltr">{dir}</bdi>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      ) : null}
      <span className="max-w-full shrink-0 truncate font-semibold text-foreground">{base}</span>
    </p>
  );
}

function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // 剪贴板不可用（非安全上下文、被拒绝）就保持原样，不提示成功。
    void navigator.clipboard?.writeText(path).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button type="button" aria-label={copied ? "已复制路径" : "复制路径"} title="复制路径" className={ACTION} onClick={copy}>
      {copied ? <Check aria-hidden="true" className="h-4 w-4 text-success-700" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}

/** Markdown 可以看渲染后的样子，也可以看原文。 */
function ViewToggle({ source, onChange }: { source: boolean; onChange: (source: boolean) => void }) {
  const item = (on: boolean, label: string) => (
    <button type="button" aria-pressed={source === on} className={cn("h-6 rounded-control px-2 text-small", source === on ? "bg-card font-medium text-foreground shadow-sm" : "text-gray-600 hover:bg-gray-200")} onClick={() => onChange(on)}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="查看方式" className="flex shrink-0 items-center gap-0.5 rounded-control bg-secondary p-0.5">
      {item(false, "预览")}
      {item(true, "源码")}
    </div>
  );
}

export function ArtifactPreview({ file }: { file: ArtifactFile }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; loaded: Loaded }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(false);
  const kind = fileKind(file.name, file.mediaType);

  useEffect(() => {
    let gone = false;
    setState({ status: "loading" });
    load(file)
      .then((loaded) => !gone && setState({ status: "ready", loaded }))
      .catch((err: unknown) => !gone && setState({ status: "error", message: describeFailure("打开产物失败", err) }));
    return () => {
      gone = true;
    };
  }, [file, attempt]);

  const download = () => {
    void getArtifactURL(file.manifestId, file.name).then((url) => window.open(url, "_blank", "noopener,noreferrer"));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="artifact-preview">
      <div className="flex h-10 shrink-0 items-center gap-1 px-4">
        <Breadcrumb name={file.name} />
        {kind === "markdown" && state.status === "ready" && state.loaded.text !== null ? <ViewToggle source={source} onChange={setSource} /> : null}
        <CopyPath path={file.name} />
        <button type="button" aria-label="下载" title={`下载（${formatSize(file.size)}）`} className={ACTION} onClick={download}>
          <Download aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {state.status === "loading" ? <Skeleton className="m-4 h-48" /> : null}
        {state.status === "error" ? (
          <div className="space-y-3 p-4">
            <Alert>{state.message}</Alert>
            <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
              <RotateCw aria-hidden="true" className="h-4 w-4" />
              重试
            </Button>
          </div>
        ) : null}
        {state.status === "ready" ? <Body kind={kind === "markdown" && source ? "text" : kind} loaded={state.loaded} file={file} onDownload={download} /> : null}
      </div>
    </div>
  );
}

function Body({ kind, loaded, file, onDownload }: { kind: ReturnType<typeof fileKind>; loaded: Loaded; file: ArtifactFile; onDownload: () => void }) {
  if (kind === "image") return <img src={loaded.url} alt={file.name} className="mx-auto max-w-full p-4" />;
  if (kind === "html" && loaded.text !== null) {
    // 沙箱里能跑脚本（幻灯片要翻页），但拿不到本页的任何数据和登录态。
    return <iframe title={file.name} sandbox="allow-scripts" srcDoc={loaded.text} className="h-full min-h-[480px] w-full bg-white" />;
  }
  if (kind === "markdown" && loaded.text !== null) {
    return (
      <div className="min-h-full p-5">
        <RichText text={loaded.text} />
      </div>
    );
  }
  if (kind === "text" && loaded.text !== null) {
    return <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-mono text-caption text-foreground">{loaded.text}</pre>;
  }
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-body text-muted-foreground">这种文件不能在这里预览，或者文件太大。</p>
      <Button variant="primary" onClick={onDownload}>
        <Download aria-hidden="true" className="h-4 w-4" />
        下载
      </Button>
    </div>
  );
}
