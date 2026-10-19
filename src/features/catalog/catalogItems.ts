import type { Asset } from "../../api/types";
export function catalogItems(assets: readonly Asset[], workspace: readonly { asset_id: string }[], tenant: readonly { asset_id: string }[]) {
  const installed = new Set([...workspace, ...tenant].map((item) => item.asset_id));
  return assets.filter((asset) => asset.status === "active").map((asset) => ({ asset, installed: installed.has(asset.id) }))
    .sort((a, b) => Number(b.installed) - Number(a.installed) || a.asset.name.localeCompare(b.asset.name));
}
export const conversationLink = (asset: Pick<Asset, "kind" | "publisher" | "name">) => `/sessions?new=${asset.kind}:${asset.publisher}/${asset.name}`;
