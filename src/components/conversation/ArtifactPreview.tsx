import { Download, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { describeFailure } from "../../lib/api";
import { fileKind, type ArtifactFile } from "../../lib/artifacts";
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

export function ArtifactPreview({ file }: { file: ArtifactFile }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; loaded: Loaded }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
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
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{file.name}</p>
        <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
        <Button size="sm" variant="ghost" aria-label="下载" onClick={download}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted">
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
        {state.status === "ready" ? <Body kind={kind} loaded={state.loaded} file={file} onDownload={download} /> : null}
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
      <div className="bg-card p-5">
        <RichText text={loaded.text} />
      </div>
    );
  }
  if (kind === "text" && loaded.text !== null) {
    return <pre className="whitespace-pre-wrap break-words bg-card p-5 font-mono text-xs text-foreground">{loaded.text}</pre>;
  }
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-muted-foreground">这种文件不能在这里预览，或者文件太大。</p>
      <Button variant="primary" onClick={onDownload}>
        <Download aria-hidden="true" className="h-4 w-4" />
        下载
      </Button>
    </div>
  );
}
