import { isEmbeddedInWujie } from "./wujie";

const STYLE_ID = "orbit-embedded-styles";

/**
 * wujie 渲染 shadow 时会丢掉模板 head 里的静态样式表，子应用会完全没有样式。
 * 嵌入态把构建期 CSS（`?inline` 字符串）作为 <style> 挂到当前 document；独立部署不执行。
 */
export function ensureEmbeddedStyles(css: string) {
  if (!isEmbeddedInWujie() || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // 内容区用 size-full，挂载点要有确定高度，百分比高度链才能解析。
  style.textContent = `${css}\n#root { height: 100%; }`;
  document.head.appendChild(style);
}
