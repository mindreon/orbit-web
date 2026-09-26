import { isRouteErrorResponse, Link, useRouteError } from "react-router";

/** 未知地址的应用内 404，显示在现有侧栏布局里。 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-8 text-center">
      <h1 className="text-xl font-semibold text-[#1a1a1a]">页面不存在</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#666]">这个地址没有对应的页面。旧书签或已经失效的链接会来到这里。</p>
      <Link to="/" className="mt-5 rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white">
        返回任务台
      </Link>
    </div>
  );
}

/** 数据路由抛错时替换默认的开发者错误页。 */
export function RouteErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : null;
  const missing = status === 404;
  const detail = isRouteErrorResponse(error)
    ? error.statusText || ""
    : error instanceof Error
      ? error.message
      : "";

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-8 text-center">
      <h1 className="text-xl font-semibold text-[#1a1a1a]">{missing ? "页面不存在" : "页面出错了"}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#666]">
        {missing
          ? "这个地址没有对应的页面。旧书签或已经失效的链接会来到这里。"
          : status
            ? `页面暂时打不开（${status}${detail ? ` ${detail}` : ""}）。`
            : detail || "页面暂时打不开，请回到任务台再试。"}
      </p>
      <Link to="/" className="mt-5 rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white">
        返回任务台
      </Link>
    </div>
  );
}
