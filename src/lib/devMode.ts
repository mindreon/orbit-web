import { useSyncExternalStore } from "react";
import { getUiPrefs, subscribeUiPrefs } from "./uiPrefs";

/** `?debug=1` 只对这一次页面加载生效：模块加载时读一次，应用内跳转不丢，刷新后（地址里没了）就关。 */
const debugFromUrl = (() => {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
})();

export const isDeveloperMode = (): boolean => debugFromUrl || getUiPrefs().developer;

/** 开发者模式开着时，任务页才显示计划图、执行记录、事件日志、完整用量和思考过程。 */
export function useDeveloperMode(): boolean {
  return useSyncExternalStore(subscribeUiPrefs, isDeveloperMode);
}
