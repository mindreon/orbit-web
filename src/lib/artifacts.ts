import type { ArtifactManifest } from "./tasks";

export type FileKind = "image" | "html" | "markdown" | "text" | "pdf" | "other";

export interface ArtifactFile {
  readonly manifestId: string;
  readonly attemptId: string;
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
}

/** 一个产物清单里可以有多个文件，摊平成一份文件列表，保持清单和文件的顺序。 */
export function flattenArtifacts(manifests: readonly ArtifactManifest[]): readonly ArtifactFile[] {
  return manifests.flatMap((manifest) =>
    manifest.entries.flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      if (!name) return [];
      return [
        {
          manifestId: manifest.manifest_id,
          attemptId: manifest.attempt_id ?? "",
          name,
          mediaType: typeof entry.media_type === "string" ? entry.media_type : "",
          size: typeof entry.size_bytes === "number" ? entry.size_bytes : 0,
        },
      ];
    }),
  );
}

const extension = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/** 决定怎么预览：图片直接显示，HTML 放沙箱，文本和 Markdown 渲染，PDF 和其他文件只给下载。 */
export function fileKind(name: string, mediaType: string): FileKind {
  const ext = extension(name);
  if (mediaType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (mediaType === "text/html" || ["html", "htm"].includes(ext)) return "html";
  if (mediaType === "text/markdown" || ["md", "markdown"].includes(ext)) return "markdown";
  if (mediaType === "application/pdf" || ext === "pdf") return "pdf";
  if (mediaType.startsWith("text/") || ["txt", "log", "json", "csv", "js", "ts", "py", "go", "yaml", "yml", "xml", "sh", "css"].includes(ext)) return "text";
  return "other";
}

export const fileKey = (file: Pick<ArtifactFile, "manifestId" | "name">) => `${file.manifestId}/${file.name}`;
