import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { Asset, S } from "../../api/types";
import { ApiError, describeFailure } from "../../api/errors";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { gzipTar, MAX_ARCHIVE } from "../../lib/tar";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Input, Select } from "../../ui/fields";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { assetFile, useAsset, useAssetMutation } from "./api";
import { allAssetPages } from "./versionData";
import { QueryContent } from "./shared";
import { editorFile, fileState, jsonError, newFile, nextPatch, packEditorFiles, template, versionValid, type EditorFile } from "./editor";

export default function VersionEditor() {
  const { assetId = "" } = useParams(); const asset = useAsset(assetId); const [search] = useSearchParams(); const { currentTenant } = useIdentity(); const from = search.get("from");
  const base = useQuery({ queryKey: qk.assetVersion(currentTenant?.id ?? null, assetId, from ?? "latest", "editor"), enabled: Boolean(asset.data), staleTime: Infinity, queryFn: async ({ signal }) => {
    const versions = await allAssetPages<S["AssetVersion"]>(`/assets/${assetId}/versions`, signal);
    const previous = from ? versions.find((v) => v.id === from) : [...versions].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    if (from && !previous) throw new Error("找不到所选的基础版本");
    if (!previous) return { version: undefined, files: Object.entries(template(asset.data!.kind)).map(([path, text]) => editorFile(path, text, true)) };
    const files = await allAssetPages<S["AssetFile"]>(`/assets/${assetId}/versions/${previous.id}/files`, signal);
    const loaded: EditorFile[] = [];
    // Bound fetch concurrency and preserve binary bytes unchanged in new archives.
    for (let i = 0; i < files.length; i += 8) loaded.push(...await Promise.all(files.slice(i, i + 8).map(async (file) => {
      const blob = await assetFile(assetId, previous.id, file.path, signal); const bytes = new Uint8Array(await blob.arrayBuffer()); let text: string | null = null;
      try { if (!bytes.includes(0)) text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { /* Binary files remain read-only. */ }
      return { path: file.path, bytes, text, original: text, added: false, deleted: false };
    })));
    return { version: previous, files: loaded };
  } });
  return <QueryContent query={asset}><QueryContent query={base}>{asset.data && base.data ? <Editor key={`${assetId}:${base.data.version?.id ?? "template"}`} asset={asset.data} initialFiles={base.data.files} previous={base.data.version} /> : null}</QueryContent></QueryContent>;
}
export function Editor({ asset, initialFiles, previous }: { asset: Asset; initialFiles: EditorFile[]; previous?: S["AssetVersion"] }) {
  const navigate = useNavigate(); const [files, setFiles] = useState(initialFiles); const [selected, setSelected] = useState(initialFiles[0]?.path ?? ""); const [version, setVersion] = useState(nextPatch(previous?.version)); const [path, setPath] = useState(""); const [errors, setErrors] = useState<Record<string, string | null>>({}); const [error, setError] = useState<unknown>(null); const [archive, setArchive] = useState<File | null>(null); const picker = useRef<HTMLInputElement>(null); const write = useAssetMutation(asset.id, (result) => { intent.succeeded(); const saved = result as S["AssetVersion"]; flushSync(() => navigate(`/assets/${asset.id}/versions/${saved.id}`)); });
  const intent = useIdempotencyIntent({ asset: asset.id, version, files: files.map((f) => [f.path, f.text, f.deleted]), archive: archive ? [archive.name, archive.size, archive.lastModified] : null });
  const current = files.find((f) => f.path === selected);
  const update = (patch: Partial<EditorFile>) => setFiles((all) => all.map((f) => f.path === selected ? { ...f, ...patch } : f));
  const upload = async (raw?: File) => {
    setError(null);
    try {
      if (!versionValid(version)) throw new Error("请输入有效的版本号，例如 1.0.0");
      if (raw && (!/\.(tar\.gz|tgz)$/i.test(raw.name) || raw.size > MAX_ARCHIVE || !raw.size)) throw new Error("请选择不超过 50 MiB 的 .tar.gz 或 .tgz 文件");
      const body = raw ?? await gzipTar(packEditorFiles(files));
      if (body.size > MAX_ARCHIVE) throw new Error("压缩包不能超过 50 MiB");
      write.mutate(() => api.postBinary<S["AssetVersion"]>(`/assets/${asset.id}/versions`, body, { query: { version }, idempotencyKey: intent.key }));
    } catch (failure) { setError(failure); }
  };
  const failure = error ?? write.error;
  return <><PageHeader title={`新版本 · ${asset.name}`} actions={<div className="flex flex-wrap items-center justify-end gap-2"><Input aria-label="版本号" className="w-32 font-mono" value={version} onChange={(e) => setVersion(e.target.value)} /><Button variant="ghost" disabled={write.isPending} onClick={() => picker.current?.click()}>上传压缩包</Button><Button variant="primary" disabled={write.isPending} onClick={() => void upload(archive ?? undefined)}>上传版本</Button><input aria-label="压缩包文件" ref={picker} type="file" accept=".tar.gz,.tgz" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setArchive(file); setError(null); } }} /></div>} /><PageBody>
    {failure ? <Alert className="mb-4">{describeFailure("上传失败", failure)}{failure instanceof ApiError ? <code className="ml-2 font-mono">{failure.code}</code> : null}</Alert> : null}
    {archive ? <Alert tone="info" className="mb-4">将上传 {archive.name}，不使用编辑器内容。<Button size="sm" onClick={() => { setArchive(null); if (picker.current) picker.current.value = ""; }}>返回编辑器</Button></Alert> : null}
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]"><aside className="rounded-card bg-card p-3"><Select aria-label="选择文件" className="mb-3 w-full lg:hidden" value={selected} onChange={(e) => setSelected(e.target.value)}>{files.map((f) => <option key={f.path} value={f.path}>{f.path} · {fileState(f)}</option>)}</Select><ul aria-label="版本文件" className="hidden space-y-1 lg:block">{files.map((f) => <li key={f.path} className="flex items-center gap-1"><button className={`flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-2 text-left text-small hover:bg-secondary ${selected === f.path ? "bg-secondary" : ""}`} onClick={() => setSelected(f.path)}>{errors[f.path] || fileState(f) === "已修改" ? <span aria-label={errors[f.path] ? "JSON 无效" : "已修改"} className={`h-1.5 w-1.5 shrink-0 rounded-full ${errors[f.path] ? "bg-danger-500" : "bg-warning-500"}`} /> : null}<span className={`truncate font-mono ${f.deleted ? "line-through text-muted-foreground" : ""}`}>{f.path}</span>{f.added && !f.deleted ? <span className="text-caption text-success-700">新增</span> : null}</button>{f.deleted ? <Button size="sm" variant="ghost" aria-label={`恢复 ${f.path}`} onClick={() => setFiles((all) => all.map((item) => item.path === f.path ? { ...item, deleted: false } : item))}>撤销</Button> : null}</li>)}</ul><form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); try { const next = newFile(files, path); setFiles(next); setSelected(path); setPath(""); setError(null); } catch (failure) { setError(failure); } }}><Input aria-label="新文件路径" className="font-mono text-small" placeholder="path/to/file.md" value={path} onChange={(e) => setPath(e.target.value)} /><Button type="submit" variant="ghost" size="sm">新建文件</Button></form></aside>
    <section className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2 text-small"><code className="break-all font-mono">{current?.path}</code><span className="text-muted-foreground">{previous ? `基于 ${previous.version}` : "模板"}</span><span className="ml-auto text-caption text-muted-foreground">{current ? fileState(current) : "选择文件"}</span>{current ? <Button size="sm" variant="ghost" onClick={() => update({ deleted: !current.deleted })}>{current.deleted ? "恢复文件" : "删除文件"}</Button> : null}</div>{current ? current.text === null ? <p className="rounded-card bg-card p-4 text-small text-muted-foreground">二进制文件；上传时保留原始内容。</p> : <><textarea aria-label="文件内容" spellCheck={false} disabled={current.deleted || Boolean(archive)} className="min-h-96 w-full resize-y rounded-card bg-card p-4 font-mono text-small leading-relaxed outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50 lg:min-h-[32rem]" value={current.text} onChange={(e) => update({ text: e.target.value })} onBlur={() => setErrors((all) => ({ ...all, [current.path]: jsonError(current.path, current.text) }))} onKeyDown={(e) => { if (e.key !== "Tab") return; e.preventDefault(); const target = e.currentTarget; const start = target.selectionStart; const end = target.selectionEnd; update({ text: current.text!.slice(0, start) + "  " + current.text!.slice(end) }); requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; }); }} />{errors[current.path] ? <p role="status" className="mt-2 text-small text-danger-700">{errors[current.path]}</p> : null}</> : <p className="text-small text-muted-foreground">新建文件以开始编辑。</p>}</section></div>
  </PageBody></>;
}
