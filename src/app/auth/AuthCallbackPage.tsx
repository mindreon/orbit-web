import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { describeFailure } from "../../api/errors";
import { Alert } from "../../ui/Alert";
import { Skeleton } from "../../ui/Skeleton";
import { auth } from "../api";
import { useAuth } from "./context";
import { LOGIN_PATH } from "./controller";

/** Where the IdP sends the browser back to. Exchanges the code, then continues where the person was going. */
export function AuthCallbackPage() {
  const { config } = useAuth();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    // The login mode arrives with /auth/config; the exchange needs it.
    if (!config) return;
    auth.completeLogin(window.location.href).then(
      (returnTo) => navigate(returnTo, { replace: true }),
      (error: unknown) => setFailure(describeFailure("登录失败", error)),
    );
  }, [config, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm space-y-4 rounded-card bg-card p-6 shadow-sm">
        {failure ? (
          <>
            <Alert>{failure}</Alert>
            <Link to={LOGIN_PATH} replace className="text-body text-primary-700 underline underline-offset-2">
              回到登录页
            </Link>
          </>
        ) : (
          <>
            <p className="text-body text-muted-foreground">正在登录…</p>
            <Skeleton className="h-6" />
          </>
        )}
      </div>
    </main>
  );
}
