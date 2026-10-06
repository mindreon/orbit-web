import { useEffect, useMemo, useState } from "react";
import { describeFailure } from "../../lib/api";
import { getExpertFile, listExpertFiles, type ExpertFiles as Listing } from "../../lib/experts";
import { Alert } from "../../ui/Alert";
import { FileBrowser, type BrowserFile } from "../FileBrowser";

/** 专家当前版本的文件（只读）：列表先取，点开哪个文件再取哪个的内容。 */
export function ExpertFiles({ expertId, version }: { expertId: string; version?: number }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [bodies, setBodies] = useState<Readonly<Record<string, string>>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setListing(null);
    setBodies({});
    setError("");
    listExpertFiles(expertId, version)
      .then((body) => !gone && setListing(body))
      .catch((err: unknown) => !gone && setError(describeFailure("读取专家文件失败", err)));
    return () => {
      gone = true;
    };
  }, [expertId, version]);

  const files = useMemo<BrowserFile[]>(() => (listing?.files ?? []).map((file) => ({ path: file.path, size: file.size, body: bodies[file.path] ?? "" })), [listing, bodies]);

  const open = (path: string) => {
    if (!listing || path in bodies) return;
    setLoading(path);
    getExpertFile(expertId, path, listing.version)
      .then((file) => setBodies((prev) => ({ ...prev, [path]: file.content })))
      .catch((err: unknown) => setError(describeFailure("读取文件失败", err)))
      .finally(() => setLoading((current) => (current === path ? null : current)));
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-medium text-gray-700">文件</p>
      {error ? <Alert>{error}</Alert> : null}
      {listing ? <FileBrowser files={files} emptyText="这个版本没有文件" prefer={["agents.md"]} onOpen={open} loadingPath={loading} /> : error ? null : <p className="text-small text-muted-foreground">正在读取文件</p>}
    </div>
  );
}
