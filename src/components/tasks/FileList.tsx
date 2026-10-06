import type { ArtifactFile } from "../../lib/artifacts";
import { formatSize } from "../../lib/time";
import { FileIcon } from "../conversation/ArtifactCards";
import { Section, SectionEmpty } from "./Section";

/** 一排可点的文件：点一个就在新标签页里预览。 */
export function FileRows({ files, onOpen }: { readonly files: readonly ArtifactFile[]; readonly onOpen: (file: ArtifactFile) => void }) {
  return (
    <ul className="mt-2 flex flex-col gap-0.5 rounded-card bg-card p-1">
      {files.map((file) => (
        <li key={`${file.manifestId}/${file.name}`}>
          <button type="button" className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-gray-100" onClick={() => onOpen(file)}>
            <FileIcon file={file} size="sm" />
            <span className="min-w-0 flex-1 truncate text-body text-foreground">{file.name}</span>
            <span className="shrink-0 text-caption text-muted-foreground">{formatSize(file.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 右侧「产物」视图：任务里全部该给人看的文件（调用方已经滤掉依赖和构建输出）。 */
export function FileList({ files, onOpen }: { readonly files: readonly ArtifactFile[]; readonly onOpen: (file: ArtifactFile) => void }) {
  return (
    <Section title={`产物 (${files.length})`} label="产物">
      {files.length === 0 ? <SectionEmpty>暂无产物</SectionEmpty> : <FileRows files={files} onOpen={onOpen} />}
    </Section>
  );
}
