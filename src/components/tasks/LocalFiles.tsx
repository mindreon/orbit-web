import { useRef, useState } from "react";
import { FileText, X } from "lucide-react";

/** 单个附件上限。后端还没有上传接口，文件内容读成文本并入消息，太大了消息装不下。 */
const MAX_BYTES = 200 * 1024;

export type LocalFiles = ReturnType<typeof useLocalFiles>;

/** 本地附件：挑文件、展示胶囊；发送时由 filesToAttachmentText 读成文本。 */
export function useLocalFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  const removeAt = (index: number) => setFiles((current) => current.filter((_, i) => i !== index));
  const clear = () => setFiles([]);
  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      aria-label="选择文件"
      onChange={(event) => {
        const picked = event.target.files;
        if (picked?.length) setFiles((current) => [...current, ...Array.from(picked)]);
        // 清空 value，同一个文件还能再选一次。
        event.target.value = "";
      }}
    />
  );
  return { files, pick, removeAt, clear, input };
}

/** 把本地文件读成文本，包成消息里的附件块。带不走的（超大、二进制）变成提示语。 */
export async function filesToAttachmentText(files: readonly File[]): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const blocks: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      warnings.push(`「${file.name}」超过 200KB，这次先不附带`);
      continue;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      warnings.push(`「${file.name}」读不出来，这次先不附带`);
      continue;
    }
    if (content.includes("\0")) {
      warnings.push(`「${file.name}」是二进制文件，目前只支持文本文件`);
      continue;
    }
    if (content.length > 300_000) {
      content = `${content.slice(0, 300_000)}\n…（内容过长，已截断）`;
    }
    // 内容里可能有 ```，围栏用四反引号包住。
    const fence = content.includes("```") ? "````" : "```";
    blocks.push(`以下是附带文件「${file.name}」的内容：\n${fence}\n${content}\n${fence}\n附件结束。`);
  }
  const text = blocks.length ? `\n\n${blocks.join("\n\n")}` : "";
  return { text, warnings };
}

/** 输入行里的文件胶囊：回形针 + 文件名 + 移除。 */
export function FileChips({ files, onRemove }: { files: readonly File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul aria-label="附带文件" className="flex max-w-[60%] flex-wrap items-center gap-1.5 py-2.5">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} data-testid="file-chip" className="flex h-7 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption text-foreground">
          <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-40 truncate" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            aria-label={`移除 ${file.name}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200"
            onClick={() => onRemove(index)}
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
