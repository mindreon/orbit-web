/**
 * wujie 嵌入态判定与类型。standalone 部署（子应用独立访问）不受任何影响；
 * 嵌入态由基座通过 wujie provide 注入 { bus, location, props }。
 * 移植自 netflow packages/micro-fe/src/types.ts（wujie 2.1.0 sandbox.js provide 定义）。
 */

export interface WujieLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export interface WujieBus {
  $emit: (event: string, ...args: unknown[]) => void;
  $on: (event: string, callback: (...args: unknown[]) => void) => void;
  $off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

export interface WujieProvide {
  bus: WujieBus;
  location?: WujieLocation;
  props?: { locale?: string };
  /** shadow 模式下由 wujie 注入（sandbox.js），degrade/无 shadow 时缺省。 */
  shadowRoot?: ShadowRoot;
}

declare global {
  interface Window {
    $wujie?: WujieProvide;
  }
}

export function isEmbeddedInWujie(): boolean {
  return typeof window !== "undefined" && !!window.$wujie;
}

/**
 * 嵌入态下基座页面的 return path（基座真实地址栏形态，如 /baize/orbit/sessions）。
 *
 * wujie 2.1.0 的 module 脚本（Vite 入口）看到的 window.location 是子应用 iframe 自己的
 * 地址（/orbit/x），不是基座地址栏。基座地址栏在同源的 window.parent.location。
 * 独立态 window.location 即子应用自身地址。
 */
export function wujieMainReturnPath(): string | null {
  if (!isEmbeddedInWujie()) return null;
  try {
    const location = window.parent.location;
    return `${location.pathname}${location.search}${location.hash}`;
  } catch {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
}

/**
 * 嵌入态整页跳转必须走基座地址栏：写 iframe 自己的 window.location 只会移动隐藏的
 * wujie iframe，基座地址栏不动。父窗口不可写时回落子应用自身跳转。
 */
export function wujieNavigate(url: string, mode: "assign" | "replace" = "assign"): void {
  try {
    if (isEmbeddedInWujie() && window.parent && window.parent !== window) {
      window.parent.location[mode](url);
      return;
    }
  } catch {
    // 父窗口不可写：回落子应用自身跳转。
  }
  window.location[mode](url);
}
