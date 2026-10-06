import { Code2, Download, File, FileImage, FileText } from "lucide-react";
import { fileKind, keyArtifacts, visibleArtifacts, type ArtifactFile, type FileKind } from "../../lib/artifacts";
import { formatSize } from "../../lib/time";
import { getArtifactURL } from "../../lib/tasks";

const KIND_ICON: Record<FileKind, { Icon: typeof File; box: string }> = {
  image: { Icon: FileImage, box: "bg-primary-100 text-primary-700" },
  html: { Icon: Code2, box: "bg-accent text-accent-foreground" },
  markdown: { Icon: FileText, box: "bg-success-100 text-success-700" },
  text: { Icon: FileText, box: "bg-secondary text-muted-foreground" },
  pdf: { Icon: FileText, box: "bg-danger-100 text-danger-700" },
  other: { Icon: File, box: "bg-secondary text-muted-foreground" },
};

export function FileIcon({ file, size = "md" }: { file: Pick<ArtifactFile, "name" | "mediaType">; size?: "sm" | "md" }) {
  const { Icon, box } = KIND_ICON[fileKind(file.name, file.mediaType)];
  const dimension = size === "sm" ? "h-6 w-6" : "h-9 w-9";
  return (
    <span className={`flex ${dimension} shrink-0 items-center justify-center rounded-control ${box}`}>
      <Icon aria-hidden="true" className={size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
    </span>
  );
}

/** 用一个 10 分钟有效的临时链接下载。 */
export function downloadArtifact(file: Pick<ArtifactFile, "manifestId" | "name">) {
  void getArtifactURL(file.manifestId, file.name).then((url) => window.open(url, "_blank", "noopener,noreferrer"));
}

/**
 * 回复末尾的产物卡片：最多三个要紧的文件（文档和网页优先，依赖和构建输出不算），点卡片在右侧预览，点右边的图标下载；
 * 其余的在右侧「产物」里看。`total` 是整个任务的产物数，缺省时用这条消息自己的。
 */
export function ArtifactCards({ files, total, onOpen, onOpenAll }: { files: readonly ArtifactFile[]; total?: number; onOpen: (file: ArtifactFile) => void; onOpenAll: () => void }) {
  const shown = keyArtifacts(files);
  if (shown.length === 0) return null;
  return (
    <div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((file) => (
          <li key={`${file.manifestId}/${file.name}`} className="flex items-center gap-1 rounded-card bg-secondary pr-2 hover:bg-gray-200">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left" onClick={() => onOpen(file)}>
              <FileIcon file={file} />
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-foreground">{file.name}</span>
                <span className="block text-caption text-muted-foreground">{formatSize(file.size)}</span>
              </span>
            </button>
            <button type="button" aria-label={`下载 ${file.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-500 hover:bg-card hover:text-foreground" onClick={() => downloadArtifact(file)}>
              <Download className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 text-small text-muted-foreground hover:text-foreground" onClick={onOpenAll}>
        查看所有产物 ({total ?? visibleArtifacts(files).length}) ›
      </button>
    </div>
  );
}
