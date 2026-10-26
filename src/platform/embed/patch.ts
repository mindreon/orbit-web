import { isEmbeddedInWujie } from "./types";

/**
 * 嵌入态补齐 document.dispatchEvent 转发（移植自 netflow packages/micro-fe/src/patch.ts）。
 *
 * wujie 2.1.0 shadow 模式把子应用 document 的 addEventListener 重定向到 shadowRoot，
 * 但 dispatchEvent 不在 documentProxyProperties 里——派发仍走 iframe 原始 document。
 * 收发分离导致依赖 document 自定义事件做层栈同步的库失效：Radix dismissable-layer
 * 的 dispatchUpdate() 成为死信，弹层拿不到 pointer-events:auto，任意点击都被判
 * “层外”而立即关闭（Dialog/Select/DropdownMenu 点一下就关）。
 *
 * 修复：shadow 嵌入时把 document.dispatchEvent 转发到 shadowRoot（与 addEventListener
 * 的重定向对称）。shadowRoot 优先取 wujie 注入的 provide.shadowRoot，回落 getRootNode()。
 * 跨 realm 陷阱：shadowRoot 是主文档 realm 的对象，不能 `instanceof ShadowRoot`
 * （iframe realm 的构造器，永远 false），用 nodeType(=11)+host 鸭子判定。
 * degrade 模式走原始派发，standalone 不执行。
 */
export function patchWujieDocumentDispatch(): void {
  if (!isEmbeddedInWujie()) return;
  const rawDispatchEvent = document.dispatchEvent.bind(document);
  document.dispatchEvent = ((event: Event) => {
    const root = window.$wujie?.shadowRoot ?? document.body?.getRootNode?.();
    if (root && root.nodeType === 11 && "host" in root) return root.dispatchEvent(event);
    return rawDispatchEvent(event);
  }) as typeof document.dispatchEvent;
}
