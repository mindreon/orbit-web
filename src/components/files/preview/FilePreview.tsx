import { ArrowLeft, Check, ChevronRight, Copy, Download, RotateCw } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { describeFailure } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatSize } from "../../../lib/time";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Skeleton } from "../../../ui/Skeleton";
import { CODE, findPreviewer, languageOf } from "./registry";
import type { FileSource, PreviewProps, Previewer } from "./types";

const ACTION = "flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-gray-200";
const NO_PREVIEW = "此格式暂不支持预览，请下载查看";

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

/** 有渲染效果的格式（Markdown、HTML、SVG）可以看渲染后的样子，也可以看原文。 */
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

type Loaded = { readonly text?: string; readonly blob?: Blob };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; loaded: Loaded };

function Fallback({ message, onDownload }: { message: string; onDownload: () => void }) {
  return (
    <div data-testid="preview-fallback" className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-body text-muted-foreground">{message}</p>
      <Button variant="primary" onClick={onDownload}>
        <Download aria-hidden="true" className="h-4 w-4" />
        下载
      </Button>
    </div>
  );
}

/**
 * 所有打开文件的地方共用的预览：面包屑、复制路径、下载、渲染/源码切换、加载和出错状态由这里管；
 * 怎么画一种格式由 `registry.ts` 里的预览器决定（第一个匹配的赢，没有匹配就只给下载）。
 * `source` 要稳定（useMemo）：它一变就重新读取内容。
 */
export function FilePreview({ source, assumeText = false, hideFrontmatter = false, pending = false, onBack }: { source: FileSource; assumeText?: boolean; hideFrontmatter?: boolean; pending?: boolean; onBack?: () => void }) {
  const previewer = findPreviewer(source.name, source.mediaType, assumeText);
  const tooLarge = Boolean(previewer?.maxBytes && source.size !== undefined && source.size > previewer.maxBytes);
  const runnable = previewer !== null && !tooLarge && !pending;
  const kind = previewer?.load;
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    if (!runnable || !kind) return;
    let gone = false;
    setState({ status: "loading" });
    const read = kind === "text" ? source.readText().then((text) => ({ text })) : source.readBlob().then((blob) => ({ blob }));
    read.then((loaded) => !gone && setState({ status: "ready", loaded })).catch((err: unknown) => !gone && setState({ status: "error", message: describeFailure("打开文件失败", err) }));
    return () => {
      gone = true;
    };
  }, [source, runnable, kind, attempt]);

  const canToggle = Boolean(previewer?.hasSource) && state.status === "ready" && runnable;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="file-preview" data-previewer={previewer?.id ?? "none"}>
      <div className="flex h-10 shrink-0 items-center gap-1 px-4">
        {onBack ? (
          <button type="button" className="mr-1 flex shrink-0 cursor-pointer items-center gap-1 text-body text-muted-foreground hover:text-foreground" onClick={onBack}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            返回文件树
          </button>
        ) : null}
        <Breadcrumb name={source.name} />
        {canToggle ? <ViewToggle source={raw} onChange={setRaw} /> : null}
        <CopyPath path={source.name} />
        <button type="button" aria-label="下载" title={source.size !== undefined ? `下载（${formatSize(source.size)}）` : "下载"} className={ACTION} onClick={source.download}>
          <Download aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {!previewer ? <Fallback message={NO_PREVIEW} onDownload={source.download} /> : null}
        {previewer && tooLarge ? <Fallback message={`文件较大（${formatSize(source.size ?? 0)}），不在这里预览，请下载查看`} onDownload={source.download} /> : null}
        {runnable && state.status === "loading" ? <Skeleton className="m-4 h-48" /> : null}
        {previewer && pending ? <Skeleton className="m-4 h-48" /> : null}
        {runnable && state.status === "error" ? (
          <div className="space-y-3 p-4">
            <Alert>{state.message}</Alert>
            <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
              <RotateCw aria-hidden="true" className="h-4 w-4" />
              重试
            </Button>
          </div>
        ) : null}
        {runnable && state.status === "ready" ? <Rendered previewer={previewer} name={source.name} loaded={state.loaded} raw={raw} hideFrontmatter={hideFrontmatter} /> : null}
        {runnable && state.status === "ready" && previewer.approximate ? (
          <p className="px-4 pb-3 text-caption text-muted-foreground">浏览器里的排版只是近似效果，以下载的原文件为准。</p>
        ) : null}
      </div>
    </div>
  );
}

function Rendered({ previewer, name, loaded, raw, hideFrontmatter }: { previewer: Previewer; name: string; loaded: Loaded; raw: boolean; hideFrontmatter: boolean }) {
  // 源码视图统一用代码预览器画，语言按文件名选（Markdown 用 markdown，网页和 SVG 用 xml）。
  const Component = raw && previewer.hasSource ? CODE.component : previewer.component;
  const props: PreviewProps = { name, text: loaded.text, blob: loaded.blob, hideFrontmatter, language: raw ? languageOf(name) : undefined };
  return (
    <Suspense fallback={<Skeleton className="m-4 h-48" />}>
      <Component {...props} />
    </Suspense>
  );
}
