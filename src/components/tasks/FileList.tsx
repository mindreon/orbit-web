import { useMemo } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import type { ArtifactOmitted } from "../../lib/tasks";
import { FileIcon } from "../conversation/ArtifactCards";
import { FileTree } from "../files/FileTree";
import { Section, SectionEmpty } from "./Section";

/** 产物按路径组织成可折叠的文件夹树；点文件在新标签页里预览。概览和「全部产物」共用。 */
export function ArtifactTree({ files, onOpen }: { readonly files: readonly ArtifactFile[]; readonly onOpen: (file: ArtifactFile) => void }) {
  const entries = useMemo(() => files.map((file) => ({ path: file.name, size: file.size, file })), [files]);
  return (
    <FileTree
      className="mt-2 rounded-card bg-card p-1"
      label="产物文件树"
      entries={entries}
      onOpen={(entry) => onOpen(entry.file)}
      renderIcon={(entry) => <FileIcon file={entry.file} size="sm" />}
    />
  );
}

const REASON_LABEL: Readonly<Record<string, string>> = { file_cap: "文件数上限", size_cap: "单文件过大", total_cap: "总大小上限" };

/** 产物树下面的一行：清单里有文件没列出来时说一声，悬停看是哪几种原因。 */
export function OmittedNotice({ omitted }: { readonly omitted: ArtifactOmitted | null | undefined }) {
  if (!omitted || !(omitted.count > 0)) return null;
  const reasons = Object.entries(omitted.reasons ?? {})
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${REASON_LABEL[reason] ?? reason} ${n} 个`)
    .join("；");
  return (
    <p data-testid="artifact-omitted" title={reasons || undefined} className="mt-2 px-2 text-small text-muted-foreground">
      还有 {omitted.count} 个文件未列出
    </p>
  );
}

/** 右侧「产物」视图：任务里全部该给人看的文件（调用方已经滤掉依赖和构建输出）。 */
export function FileList({ files, onOpen, omitted }: { readonly files: readonly ArtifactFile[]; readonly onOpen: (file: ArtifactFile) => void; readonly omitted?: ArtifactOmitted | null }) {
  return (
    <Section title={`产物 (${files.length})`} label="产物">
      {files.length === 0 ? <SectionEmpty>暂无产物</SectionEmpty> : <ArtifactTree files={files} onOpen={onOpen} />}
      <OmittedNotice omitted={omitted} />
    </Section>
  );
}
