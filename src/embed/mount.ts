/**
 * wujie 2.1.0 重建子应用文档时 body 内容会丢失，模板里的挂载点随之消失。
 * 拿不到就自建一个并清掉残留；独立部署时等价于 getElementById。
 */
export function ensureMountPoint(mountId: string) {
  const existing = document.getElementById(mountId);
  if (existing) return existing;
  const container = document.createElement("div");
  container.id = mountId;
  document.body.replaceChildren(container);
  return container;
}
