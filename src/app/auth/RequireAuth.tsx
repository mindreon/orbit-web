import { Navigate, Outlet, useLocation } from "react-router";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useAuth } from "./context";
import { LOGIN_PATH } from "./controller";

/** Routes below this render only for a signed-in person whose profile has loaded. */
export function RequireAuth() {
  const { status, error, retry, logout } = useAuth();
  const location = useLocation();

  if (status === "anonymous") return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (status === "loading") return <Skeleton className="m-6 h-24" />;
  if (status === "failed") {
    return (
      <div className="mx-auto mt-24 w-full max-w-md space-y-4 px-4">
        <Alert>{error ?? "读取个人信息失败"}</Alert>
        <div className="flex gap-2">
          <Button variant="primary" onClick={retry}>
            重试
          </Button>
          <Button onClick={() => void logout()}>退出登录</Button>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
