import { AlertTriangle, Home, Undo2 } from "lucide-react";
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from "react-router";
import { Button } from "../ui/Button";

function ErrorScreen({ code, message }: { code: string; message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-card px-8 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <AlertTriangle aria-hidden="true" className="h-9 w-9" strokeWidth={1.5} />
      </span>
      <p className="mt-5 text-4xl font-bold text-foreground/80">{code}</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => navigate(-1)}>
          <Undo2 aria-hidden="true" className="h-4 w-4" />
          返回
        </Button>
        <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Home aria-hidden="true" className="h-4 w-4" />
          首页
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return <ErrorScreen code="404" message="这个地址没有对应的页面。" />;
}

/** 数据路由抛错时替换默认的开发者错误页。404 与通配页相同。 */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const detail = isRouteErrorResponse(error)
    ? `${error.status}${error.statusText ? ` ${error.statusText}` : ""}`
    : error instanceof Error
      ? error.message
      : "";
  return <ErrorScreen code="出错了" message={detail ? `页面暂时打不开（${detail}）。` : "页面暂时打不开。"} />;
}
