import { useEffect, useState } from "react";
import { describeFailure } from "./api";
import { listMcpConnectors, type McpConnector } from "./catalog";
import { listExperts, type Expert } from "./experts";
import type { ConfigDraft } from "./taskConfig";

export type ConfigCatalog = {
  readonly experts: readonly Expert[];
  readonly connectors: readonly McpConnector[];
  readonly loading: boolean;
  readonly error: string;
};

/** 菜单和标签要用到的专家和连接器。两个列表都不大，进入页面时读一次。 */
export function useConfigCatalog(): ConfigCatalog {
  const [state, setState] = useState<ConfigCatalog>({ experts: [], connectors: [], loading: true, error: "" });
  useEffect(() => {
    let gone = false;
    Promise.all([listExperts(), listMcpConnectors()])
      .then(([experts, connectors]) => !gone && setState({ experts, connectors: connectors.items ?? [], loading: false, error: "" }))
      .catch((err: unknown) => !gone && setState({ experts: [], connectors: [], loading: false, error: describeFailure("读取专家和连接器失败", err) }));
    return () => {
      gone = true;
    };
  }, []);
  return state;
}

/** 选中的专家（草稿里只有它的版本引用）。 */
export const expertOf = (draft: ConfigDraft, experts: readonly Expert[]): Expert | undefined =>
  draft.expert ? experts.find((item) => item.ref === draft.expert) : undefined;

/** 实际生效的技能：任务自己设了就用它（含空列表），没设就沿用专家的默认。 */
export const effectiveSkills = (draft: ConfigDraft, experts: readonly Expert[]): string[] =>
  draft.skills ?? expertOf(draft, experts)?.skill_ids ?? [];

export const effectiveConnectors = (draft: ConfigDraft, experts: readonly Expert[]): string[] =>
  draft.connectorIds ?? expertOf(draft, experts)?.connector_ids ?? [];
