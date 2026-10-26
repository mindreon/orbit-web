import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { toRouterPath } from "../../../lib/basePath";
import { ApiError, describeFailure } from "../../../api/errors";
import { isEmbeddedInWujie, wujieNavigate } from "../../embed";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Field, Input } from "../../../ui/fields";
import { Skeleton } from "../../../ui/Skeleton";
import { useIdentity } from "../context";
import { baizeLoginHref, iamAuth } from "./controller";

const DEFAULT_LANDING = "/sessions";

/**
 * `iam` 模式登录页（结构照 netflow apps/web/app/pages/login-page.tsx 的接入方式）：
 * standalone 直接调与基座相同的 IAM 接口；嵌入态登录由基座承载，本页整页跳基座登录页。
 */
export function IamLoginPage() {
  const { status, error } = useIdentity();
  const from = toRouterPath((useLocation().state as { from?: string } | null)?.from ?? DEFAULT_LANDING);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (isEmbeddedInWujie() && status === "anonymous") wujieNavigate(baizeLoginHref(), "replace");
  }, [status]);

  if (status === "authenticated") return <Navigate to={from} replace />;
  if (isEmbeddedInWujie()) {
    return <main className="flex h-full min-h-0 items-center justify-center bg-muted px-4"><p className="text-body text-muted-foreground">正在跳转到登录页…</p></main>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await iamAuth.login({ username: username.trim(), password });
    } catch (cause) {
      setFailure(cause instanceof ApiError || cause instanceof Error ? describeFailure("登录失败", cause) : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  const shown = failure ?? error;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm space-y-5 rounded-card bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-heading font-semibold text-foreground">Orbit</h1>
          <p className="mt-1 text-body text-muted-foreground">登录后使用多智能体平台</p>
        </div>
        {shown ? <Alert>{shown}</Alert> : null}
        {status === "initializing" ? <Skeleton className="h-24" /> : null}
        {status === "anonymous" ? (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="用户名">
              <Input type="text" required autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </Field>
            <Field label="密码">
              <Input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || username.trim() === "" || password === ""}>
              登录
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
