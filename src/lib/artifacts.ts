import type { ArtifactManifest, ArtifactOmitted } from "./tasks";

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

/** 同名文件在任务里被改过几次，面板里只留最新的一个；对话里每条回复仍然带着它自己那一版。 */
export function latestByName(files: readonly ArtifactFile[]): readonly ArtifactFile[] {
  const last = new Map<string, ArtifactFile>();
  for (const file of files) last.set(file.name, file);
  return files.filter((file) => last.get(file.name) === file);
}

const extension = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/** 文件的大类：用来选图标和排序；怎么预览由 `components/files/preview/registry.ts` 决定。 */
export function fileKind(name: string, mediaType: string): FileKind {
  const ext = extension(name);
  if (mediaType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (mediaType === "text/html" || ["html", "htm"].includes(ext)) return "html";
  if (mediaType === "text/markdown" || ["md", "markdown"].includes(ext)) return "markdown";
  if (mediaType === "application/pdf" || ext === "pdf") return "pdf";
  if (mediaType.startsWith("text/") || ["txt", "log", "json", "csv", "js", "ts", "py", "go", "yaml", "yml", "xml", "sh", "css"].includes(ext)) return "text";
  return "other";
}

/** 所有清单没列出的文件加在一起；一个都没落下时返回 null。 */
export function sumOmitted(manifests: readonly ArtifactManifest[]): ArtifactOmitted | null {
  const total: { count: number; bytes: number; reasons: Record<string, number> } = { count: 0, bytes: 0, reasons: {} };
  for (const manifest of manifests) {
    const omitted = manifest.omitted;
    if (!omitted || !(omitted.count > 0)) continue;
    total.count += omitted.count;
    total.bytes += omitted.bytes ?? 0;
    for (const [reason, n] of Object.entries(omitted.reasons ?? {})) total.reasons[reason] = (total.reasons[reason] ?? 0) + (n ?? 0);
  }
  return total.count > 0 ? total : null;
}

export const fileKey = (file: Pick<ArtifactFile, "manifestId" | "name">) => `${file.manifestId}/${file.name}`;

// ---- 对话和面板里该给人看的产物 -------------------------------------------------------------------------------------------

/** 路径里出现这些目录，就是依赖或构建产物，不是人要看的成果。 */
const NOISE_DIRS = new Set(["node_modules", ".venv", "venv", "__pycache__", ".git", "dist", "build", ".cache", ".next", "coverage", "site-packages", "node-compile-cache", ".npm", ".pnpm-store", ".vite"]);
const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock"]);

/** 依赖目录、构建输出、缓存和锁文件：前端兜底过滤，后端没滤干净时也不会把上百个文件摆给人看。 */
export function isNoiseArtifact(name: string): boolean {
  const segments = name.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => NOISE_DIRS.has(segment))) return true;
  return LOCKFILES.has(segments.at(-1) ?? "");
}

/** 任务里该展示的产物：同名只留最新，再去掉依赖和构建输出。 */
export const visibleArtifacts = (files: readonly ArtifactFile[]): readonly ArtifactFile[] => latestByName(files).filter((file) => !isNoiseArtifact(file.name));

const isHidden = (name: string) => name.split(/[\\/]/).some((segment) => segment.startsWith("."));

/** 越小越靠前：文档和网页最先，其次是普通文件，隐藏文件（点开头）最后。 */
function artifactRank(file: ArtifactFile): number {
  if (isHidden(file.name)) return 2;
  const kind = fileKind(file.name, file.mediaType);
  return kind === "markdown" || kind === "html" || kind === "pdf" ? 0 : 1;
}

/** 一条消息下最多摆几个产物卡片：文档和网页优先，同一档里保持原来的顺序。 */
export function keyArtifacts(files: readonly ArtifactFile[], max = 3): readonly ArtifactFile[] {
  return visibleArtifacts(files)
    .map((file, index) => ({ file, index }))
    .sort((a, b) => artifactRank(a.file) - artifactRank(b.file) || a.index - b.index)
    .slice(0, max)
    .map((item) => item.file);
}
