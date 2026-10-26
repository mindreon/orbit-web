import { isEmbeddedInWujie } from "./types";

/**
 * 嵌入态自注入样式（移植自 netflow packages/micro-fe/src/styles.ts）。
 *
 * wujie 2.1.0 渲染 shadow 时会丢弃模板 head 中的静态节点（meta、样式表都到不了
 * shadow），子应用完全无样式。宿主把构建期 CSS 以 `?inline` 字符串形式传入，
 * 嵌入态直接创建 <style> 挂到当前 document（shadow 嵌入时即 shadowRoot.head）。
 * standalone 不执行：走产物 index.html 的 <link> 正常加载。
 *
 * idPrefix 用于派生样式元素 id，同页嵌多个子应用时传各自 slug 避免撞 id。
 */
export function ensureEmbeddedStyles(appCss: string, idPrefix = "embedded"): void {
  if (!isEmbeddedInWujie()) return;

  injectStyle(`${idPrefix}-embedded-styles`, appCss);

  // 弹窗滚动锁宽度补偿修正（嵌入态专属）：Radix 滚动锁计算的 gap 来自两个 realm，
  // 差值≈基座侧栏宽度被误判为滚动条宽度，弹窗一开内容区就被挤窄。嵌入态滚动发生
  // 在基座容器上，子应用 body 无需任何补偿，按更高优先级强制归零。
  injectStyle(
    `${idPrefix}-embedded-scroll-lock-override`,
    `
      html body[data-scroll-locked] {
        margin-right: 0 !important;
        padding-right: 0 !important;
      }
    `,
  );

  // 视口单位归零（嵌入态专属）：shadow 内的 100vh/h-screen 按基座视口计算，比基座
  // header 之下的容器高出一段，composer 被顶出可视区。子应用高度链改为 100%
  // （宿主容器有确定高度，见基座 SubAppContainer），AppLayout 嵌入分支用 h-full 铺满。
  injectStyle(
    `${idPrefix}-embedded-viewport-override`,
    `
      :host, html, body, #root {
        height: 100%;
        min-height: 0 !important;
      }
    `,
  );
}

/** 按幂等 id 注入一段样式（嵌入态/独立态均可调用）。 */
export function injectStyle(id: string, css: string): void {
  const elementId = `wujie-embed-${id}`;
  if (document.getElementById(elementId)) return;
  const style = document.createElement("style");
  style.id = elementId;
  style.textContent = css;
  document.head.appendChild(style);
}
