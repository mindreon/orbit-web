import { Navigate, Outlet, useLocation } from "react-router";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useIdentity } from "./context";

export function RequireIdentity() {
  const identity = useIdentity();
  const location = useLocation();
  if (identity.status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (identity.status === "initializing") return <Skeleton className="m-6 h-24" />;
  if (identity.status === "failed") return <div className="space-y-4 p-6"><Alert>{identity.error}</Alert><Button onClick={identity.retry}>重试</Button><Button onClick={() => void identity.signOut()}>退出登录</Button></div>;
  return <Outlet />;
}
