import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { unifiedDiff, type DiffChunk, type DiffLine, type FileChange } from "../../lib/diff";
import { Button } from "../../ui/Button";
import { assetFile, QueryContent } from "../assets";
export function FileDiff({ assetId, versionId, previousId, change }: { assetId: string; versionId: string; previousId?: string; change: FileChange }) {
  const [open, setOpen] = useState(true); const { currentTenant } = useIdentity();
  const query = useQuery({ queryKey: qk.assetVersion(currentTenant?.id ?? null, assetId, versionId, `diff:${previousId ?? "none"}:${change.path}`), enabled: open, queryFn: async ({ signal }) => {
    const read = async (id: string) => { const bytes = new Uint8Array(await (await assetFile(assetId, id, change.path, signal)).arrayBuffer()); if (bytes.length > 256 * 1024 || bytes.includes(0)) return null; try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; } };
    const [before, after] = await Promise.all([change.status !== "added" && previousId ? read(previousId) : "", change.status !== "removed" ? read(versionId) : ""]);
    return before === null || after === null ? null : unifiedDiff(before, after);
  } });
  const labels = { added: "新增", changed: "修改", removed: "删除" };
  return <section className="min-w-0 overflow-hidden rounded-card bg-card"><header className="sticky top-0 flex items-center gap-2 bg-card px-3 py-2"><code className="min-w-0 flex-1 break-all font-mono text-small">{change.path}</code><span className={`rounded-control px-1.5 text-caption ${change.status === "added" ? "bg-success-50 text-success-700" : change.status === "removed" ? "bg-danger-50 text-danger-700" : "bg-warning-50 text-warning-700"}`}>{labels[change.status]}</span><Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "折叠" : "展开"}</Button></header>{open ? <QueryContent query={query}>{query.data ? <div className="overflow-x-auto pb-2" aria-label={`${change.path} 差异`}>{query.data.map((chunk, i) => <Chunk key={i} chunk={chunk} />)}</div> : <p className="p-3 text-small text-muted-foreground">二进制或较大文件；请到版本详情预览。</p>}</QueryContent> : null}</section>;
}
function Chunk({ chunk }: { chunk: DiffChunk }) {
  const [expanded, setExpanded] = useState(false);
  return chunk.kind === "fold" ? expanded ? <>{chunk.lines.map((line, i) => <Line key={i} line={line} />)}</> : <Button variant="ghost" size="sm" className="my-1 w-full" onClick={() => setExpanded(true)}>展开 {chunk.lines.length} 行</Button> : <Line line={chunk} />;
}
function Line({ line }: { line: DiffLine }) {
  return <div className={`grid grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] font-mono text-caption leading-relaxed ${line.kind === "add" ? "bg-success-50" : line.kind === "remove" ? "bg-danger-50" : ""}`}><span className="select-none pr-2 text-right text-muted-foreground">{line.old}</span><span className="select-none pr-2 text-right text-muted-foreground">{line.next}</span><span className={line.kind === "add" ? "text-success-700" : line.kind === "remove" ? "text-danger-700" : "text-muted-foreground"}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</span><span className="whitespace-pre-wrap break-all pr-3">{line.text || " "}</span></div>;
}
