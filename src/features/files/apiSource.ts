import type { FileSource } from "../../components/files/preview/types";
import type { S } from "../../api/types";
import { api } from "../../platform/client";
import { describeFailure } from "../../api/errors";
import { toast } from "../../platform/toast/store";
export function apiSource(artifact: S["Artifact"]): FileSource {
  const path = `/artifacts/${artifact.id}/content`;
  const readBlob = () => api.getBlob(path, { query: { inline: 1 } });
  return { name: artifact.path, mediaType: artifact.mime, size: artifact.size_bytes, readBlob, readText: async () => (await readBlob()).text(), download: () => {
    void api.getBlob(path).then((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = artifact.path.split("/").pop() ?? artifact.path; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }).catch((error: unknown) => toast.error(describeFailure("下载失败", error)));
  } };
}
