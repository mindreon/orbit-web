/**
 * 嵌入态自愈挂载点（移植自 netflow packages/micro-fe/src/mount.ts）。
 *
 * wujie 2.1.0 重建子应用文档时 <body> 内容丢失（变 "undefined" 文本），模板里的
 * 挂载点随之消失。body 元素本身仍可用：自建挂载点并清掉残留。
 * standalone 下挂载点正常存在，本函数等价于 getElementById。
 */
export function ensureMountPoint(mountId: string): HTMLElement {
  const existing = document.getElementById(mountId);
  if (existing) return existing;
  const container = document.createElement("div");
  container.id = mountId;
  document.body.replaceChildren(container);
  return container;
}
