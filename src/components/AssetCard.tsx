import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Asset } from "../api/types";
import { kindLabels, visibilityLabels } from "./kindLabels";
export function AssetCard({ asset, installed = false, showKind = false, status, conversation }: { asset: Asset; installed?: boolean; showKind?: boolean; status?: ReactNode; conversation?: string }) {
  return <article className="flex min-w-0 flex-col rounded-card bg-card p-4 transition-colors duration-150 ease-out hover:bg-gray-50">
    <Link to={`/assets/${asset.id}`} className="flex min-w-0 gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-body font-semibold uppercase text-accent-foreground">{(asset.display_name || asset.name).slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-2"><h2 className="truncate text-body font-semibold">{asset.display_name || asset.name}</h2><span className="shrink-0 rounded-control bg-gray-100 px-1.5 text-caption text-gray-700">{visibilityLabels[asset.visibility]}</span>{installed ? <span className="shrink-0 rounded-control bg-success-50 px-1.5 text-caption text-success-700">已安装</span> : null}{showKind ? <span className="rounded-control bg-gray-100 px-1.5 text-caption text-gray-700">{kindLabels[asset.kind]}</span> : null}{status}</div><p className={`mt-1 line-clamp-2 min-h-10 text-small ${asset.description ? "text-muted-foreground" : "text-gray-400"}`}>{asset.description || "暂无简介"}</p></div></Link>
    <div className="mt-auto flex items-center justify-between gap-2 pt-3"><span className="min-w-0 truncate font-mono text-caption text-gray-500">{asset.publisher}/{asset.name}</span>{conversation ? <Link to={conversation} className="inline-flex h-8 shrink-0 items-center rounded-control border border-border px-3 text-small font-medium hover:bg-secondary">开始对话</Link> : null}</div>
  </article>;
}
