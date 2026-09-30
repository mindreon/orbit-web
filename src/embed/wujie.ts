/**
 * wujie 嵌入态判定与 bus 协议。独立部署时 window.$wujie 不存在，本目录的其余代码全部不执行。
 * 协议与 baize-frontend 的 @baize/micro-fe 一致，事件名以 appName 为前缀。
 */

export const EMBED_APP_NAME = "orbit";

export const EMBED_EVENTS = {
  /** 子应用 → 基座：路由变化，载荷是 pathname + search（不含 basename）。 */
  routeChange: `${EMBED_APP_NAME}:route-change`,
  /** 基座 → 子应用：跳到子应用内地址（前进/后退/基座内链接/alive 纠偏）。 */
  navigate: `${EMBED_APP_NAME}:navigate`,
  /** 子应用 → 基座：菜单目录，可序列化，由基座自己的组件渲染。 */
  menu: `${EMBED_APP_NAME}:menu`,
} as const;

export interface WujieBus {
  $emit: (event: string, ...args: unknown[]) => void;
  $on: (event: string, callback: (...args: unknown[]) => void) => void;
  $off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    $wujie?: { bus: WujieBus; shadowRoot?: ShadowRoot };
  }
}

export function isEmbeddedInWujie() {
  return typeof window !== "undefined" && Boolean(window.$wujie);
}
