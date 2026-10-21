import type { Asset } from "../api/types";

/** Teams have no displayName field, so the Chinese name is the first line of the description. */
export function assetTitle(asset: Pick<Asset, "kind" | "name" | "display_name" | "description">) {
  if (asset.display_name) return asset.display_name;
  if (asset.kind === "team" && asset.description) return asset.description.split("\n")[0];
  return asset.name;
}

export function assetBlurb(asset: Pick<Asset, "kind" | "display_name" | "description">) {
  if (asset.kind === "team" && !asset.display_name && asset.description?.includes("\n")) return asset.description.split("\n").slice(1).join("\n");
  if (asset.kind === "team" && !asset.display_name) return null;
  return asset.description;
}
