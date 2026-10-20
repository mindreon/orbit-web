import type { Asset, S } from "../../api/types";
type State = S["AssetVersion"]["state"];
export const assetNameValid = (name: string) => /^[a-z0-9][a-z0-9-]{2,63}$/.test(name);
/** A lifecycle path, not an event history: control exposes only the current state. */
export function timelineSteps(state: State) {
  const prefix: State[] = ["draft", "submitted", "checking"];
  const reviewed: State[] = [...prefix, "in_review"];
  const released: State[] = [...reviewed, "approved", "published"];
  const paths: Partial<Record<State, State[]>> = { check_failed: [...prefix, "check_failed"], changes_requested: [...reviewed, "changes_requested"], rejected: [...reviewed, "rejected"], deprecated: [...released, "deprecated"], suspended: [...released, "suspended"], yanked: [...released, "yanked"] };
  const path = paths[state] ?? released;
  const index = path.indexOf(state);
  return path.map((value, i) => ({ state: value, tone: i < index ? "done" : i > index ? "future" : ["check_failed", "rejected"].includes(state) ? "failed" : "current" }));
}
export function versionTransitions(state: State, reviewer: boolean): S["TransitionInput"]["state"][] {
  if (state === "check_failed" || state === "changes_requested") return ["draft"];
  if (state === "published") return ["deprecated", "suspended"];
  if (state === "suspended") return reviewer ? ["published", "yanked"] : ["yanked"];
  return state === "deprecated" ? ["yanked"] : [];
}
export const assetTabs = (asset: Asset) => ["版本", "通道", "共享", "安装", ...(["skill", "mcp_server"].includes(asset.kind) ? ["被哪些专家使用"] : [])];
export const conversationLink = (asset: Pick<Asset, "kind" | "publisher" | "name">) => `/sessions?new=${asset.kind}:${asset.publisher}/${asset.name}`;
