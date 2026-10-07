import { useMemo } from "react";
import type { ArtifactFile } from "../../lib/artifacts";
import { getArtifactURL } from "../../lib/tasks";
import { FilePreview } from "./preview/FilePreview";
import { urlSource } from "./preview/sources";

/** A task artifact: its bytes come from a signed URL that control hands out per file. */
export function ArtifactFilePreview({ file }: { file: ArtifactFile }) {
  const source = useMemo(() => urlSource({ name: file.name, mediaType: file.mediaType, size: file.size }, () => getArtifactURL(file.manifestId, file.name)), [file]);
  return <FilePreview source={source} />;
}
