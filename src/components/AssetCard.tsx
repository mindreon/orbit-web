import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Asset } from "../api/types";
import { assetBlurb, assetTitle } from "./assetText";
import { kindLabels, visibilityLabels } from "./kindLabels";
export function AssetCard({ asset, installed = false, showKind = false, status, conversation }: { asset: Asset; installed?: boolean; showKind?: boolean; status?: ReactNode; conversation?: string }) {
  const title = assetTitle(asset);
  const blurb = assetBlurb(asset);
  if (conversation) {
    return (
      <article className="flex h-full min-h-[132px] min-w-0 flex-col rounded-card bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md">
        <Link to={`/assets/${asset.id}`} className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-body font-semibold text-primary-700">{title.slice(0, 1)}</span>
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{title}</span>
          {asset.kind === "team" ? <span className="shrink-0 rounded-control bg-primary-100 px-1.5 py-0.5 text-caption font-medium text-primary-700">专家团</span> : null}
          {installed ? <span className="shrink-0 rounded-control bg-success-50 px-1.5 text-caption text-success-700">已安装</span> : null}
        </Link>
        <p className={`mt-3 line-clamp-2 min-h-10 text-small leading-5 ${blurb ? "text-muted-foreground" : "text-gray-400"}`}>{blurb || "暂无简介"}</p>
        <div className="mt-auto flex items-center gap-2.5 pt-2 text-caption text-muted-foreground">
          <span className="min-w-0 flex-1 truncate font-mono">{asset.publisher}/{asset.name}</span>
          <Link to={conversation} className="shrink-0 text-small font-medium text-primary-700 hover:underline">开始对话</Link>
        </div>
      </article>
    );
  }
  return <article className="flex h-full min-h-[132px] min-w-0 flex-col rounded-card bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md">
    <Link to={`/assets/${asset.id}`} className="flex min-w-0 gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-body font-semibold uppercase text-accent-foreground">{(asset.display_name || asset.name).slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-2"><h2 className="truncate text-body font-semibold">{title}</h2><span className="shrink-0 rounded-control bg-gray-100 px-1.5 text-caption text-gray-700">{visibilityLabels[asset.visibility]}</span>{installed ? <span className="shrink-0 rounded-control bg-success-50 px-1.5 text-caption text-success-700">已安装</span> : null}{showKind ? <span className="rounded-control bg-gray-100 px-1.5 text-caption text-gray-700">{kindLabels[asset.kind]}</span> : null}{status}</div><p className={`mt-1 line-clamp-2 min-h-10 text-small ${blurb ? "text-muted-foreground" : "text-gray-400"}`}>{blurb || "暂无简介"}</p></div></Link>
    <div className="mt-auto flex items-center justify-between gap-2 pt-3"><span className="min-w-0 truncate font-mono text-caption text-gray-500">{asset.publisher}/{asset.name}</span>{conversation ? <Link to={conversation} className="inline-flex h-8 shrink-0 items-center rounded-control border border-border px-3 text-small font-medium hover:bg-secondary">开始对话</Link> : null}</div>
  </article>;
}
