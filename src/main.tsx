import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ensureEmbeddedStyles, ensureMountPoint, isEmbeddedInWujie, patchWujieDocumentDispatch } from "./platform/embed";
import { followSystemTheme } from "./platform/theme";
import appCss from "./index.css?inline";
import "./index.css";

// wujie 重建子应用文档时 <body> 内容会丢失（挂载点随之消失），自建挂载点兜底。
const container = ensureMountPoint("root");

// 嵌入态样式由本模块自注入：wujie 渲染 shadow 时会丢掉模板 head 里的静态节点。
// standalone 走构建产物自带的 <link>，不受影响。
ensureEmbeddedStyles(appCss, "orbit");

// 必须在任何弹层组件挂载前装好（详见 platform/embed/patch.ts 注释）。
patchWujieDocumentDispatch();

// 嵌入态主题由基座锁定为 light；standalone 跟随系统。
if (!isEmbeddedInWujie()) followSystemTheme();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
