import type { ArtifactFile } from "../../lib/artifacts";
import { formatSize } from "../../lib/time";
import { FileIcon } from "../conversation/ArtifactCards";
import { Section, SectionEmpty } from "./Section";

/** 右侧概览里的成果物列表：点一个文件就在新标签页里预览。 */
export function FileList({ files, onOpen }: { readonly files: readonly ArtifactFile[]; readonly onOpen: (file: ArtifactFile) => void }) {
  return (
    <Section title="成果物" label="成果物">
      {files.length === 0 ? <SectionEmpty>暂无成果物</SectionEmpty> : null}
      <ul className="mt-2 space-y-1">
        {files.map((file) => (
          <li key={`${file.manifestId}/${file.name}`}>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-secondary" onClick={() => onOpen(file)}>
              <FileIcon file={file} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
