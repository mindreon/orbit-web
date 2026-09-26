import { isRouteErrorResponse, Link, useRouteError } from "react-router";

function MissingPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-8 text-center">
      <p className="text-sm text-[#666]">这个地址没有对应的页面。</p>
      <Link to="/" className="mt-3 text-sm text-[#1a1a1a] underline">
        回到首页
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return <MissingPage />;
}

/** 数据路由抛错时替换默认的开发者错误页。404 与通配页相同。 */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <MissingPage />;
  const detail = isRouteErrorResponse(error)
    ? `${error.status}${error.statusText ? ` ${error.statusText}` : ""}`
    : error instanceof Error
      ? error.message
      : "";
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-8 text-center">
      <p className="text-sm text-[#666]">{detail ? `页面暂时打不开（${detail}）。` : "页面暂时打不开。"}</p>
      <Link to="/" className="mt-3 text-sm text-[#1a1a1a] underline">
        回到首页
      </Link>
    </div>
  );
}
